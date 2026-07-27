"""Visibility-Normalised Engagement Index — ZONE aggregates, nothing finer.

There is intentionally NO per-student engagement value in this module, in the
schema, or anywhere else. If a change ever seems to need a student identifier
on an engagement record, STOP: that violates the design (privacy tier T2 and
the k>=5 floor). See ADR 0007.

Zones are fixed horizontal bands of the FRAME: the camera stands at the front
of the room, so nearer rows appear lower in the image. A track whose box
centre sits in the bottom band (y >= front_band * height) is 'front', in the
top band (y <= back_band * height) 'back', otherwise 'mid'. Crude but stable,
and honest about being frame geometry rather than seat maps.

The visibility normalisation: vnei is computed over observations of tracks
that were actually VISIBLE in the zone that window — a sparsely-seen back row
contributes only what was seen, and its thin evidence is declared through
`coverage` (distinct tracks seen / enrolled in zone) rather than silently
skewing the number. Windows with n_tracked < k_min are suppressed outright
(also CHECK-enforced in the DB).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.store import PresenceWriter, ZoneAggregateRow
from engagement.signals import TrackSignals
from vision.types import Track

logger = logging.getLogger("sensepro.engagement")

ZONES = ("front", "mid", "back")


@dataclass
class _ZoneWindow:
    track_ids: set[int] = field(default_factory=set)
    n_obs: int = 0
    attend_obs: int = 0  # observations where the backend could tell
    attending: int = 0
    head_down: int = 0
    phone: int = 0
    still_obs: int = 0
    still: int = 0


def _rate(num: int, den: int) -> float:
    return round(num / den, 3) if den else 0.0


class ZoneAggregator:
    def __init__(
        self,
        session_id: str,
        writer: PresenceWriter,
        session_start: datetime,
        enrolled_by_zone: dict[str, int],
        window_s: float = 60.0,
        front_band: float = 0.66,
        back_band: float = 0.33,
        k_min: int = 5,
    ) -> None:
        self._session_id = session_id
        self._writer = writer
        self._session_start = session_start
        self._enrolled = enrolled_by_zone
        self._window_s = window_s
        self._front_band = front_band
        self._back_band = back_band
        self._k_min = k_min
        self._window_start_rel: float | None = None
        self._zones: dict[str, _ZoneWindow] = {}

    def zone_of(self, track: Track, frame_h: int) -> str:
        y1, y2 = track.det.box[1], track.det.box[3]
        centre_y = (y1 + y2) / 2.0
        if centre_y >= self._front_band * frame_h:
            return "front"
        if centre_y <= self._back_band * frame_h:
            return "back"
        return "mid"

    def observe(
        self,
        observations: list[tuple[Track, TrackSignals]],
        frame_h: int,
        rel_ts: float,
    ) -> list[ZoneAggregateRow]:
        """Fold one sampled frame into the current window; when the window
        boundary passes, emit (write + return) the closed window's rows."""
        emitted: list[ZoneAggregateRow] = []
        if self._window_start_rel is None:
            self._window_start_rel = rel_ts
        elif rel_ts - self._window_start_rel >= self._window_s:
            emitted = self.flush()
            self._window_start_rel = rel_ts
        for track, sig in observations:
            zone = self.zone_of(track, frame_h)
            win = self._zones.setdefault(zone, _ZoneWindow())
            win.track_ids.add(track.track_id)
            win.n_obs += 1
            if sig.attending is not None:
                win.attend_obs += 1
                win.attending += int(sig.attending)
                win.head_down += int(bool(sig.head_down))
            win.phone += int(sig.phone_nearby)
            if sig.still is not None:
                win.still_obs += 1
                win.still += int(sig.still)
        return emitted

    def flush(self) -> list[ZoneAggregateRow]:
        """Close the current window: write and return its zone rows, suppress
        any zone below the k-anonymity floor."""
        if self._window_start_rel is None:
            return []
        window_start = self._session_start + timedelta(seconds=self._window_start_rel)
        rows: list[ZoneAggregateRow] = []
        for zone, win in self._zones.items():
            n_tracked = len(win.track_ids)
            if n_tracked < self._k_min:
                logger.info("zone %s suppressed: n_tracked=%d < %d", zone, n_tracked, self._k_min)
                continue
            enrolled = self._enrolled.get(zone, 0)
            row = ZoneAggregateRow(
                session_id=self._session_id,
                window_start=window_start,
                window_s=int(self._window_s),
                zone=zone,
                n_tracked=n_tracked,
                enrolled_in_zone=enrolled,
                coverage=round(min(1.0, n_tracked / enrolled), 3) if enrolled else 0.0,
                vnei=_rate(win.attending, win.attend_obs),
                signals={
                    "phone_rate": _rate(win.phone, win.n_obs),
                    "head_down_rate": _rate(win.head_down, win.attend_obs),
                    "still_rate": _rate(win.still, win.still_obs),
                },
            )
            self._writer.create_zone_aggregate(row)
            rows.append(row)
        self._zones = {}
        return rows
