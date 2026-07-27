"""Per-frame behavioural signals — the Tier-2 input, transient by design.

These values exist for the lifetime of one frame's aggregation call and are
never stored anywhere per student: the ONLY persistence of engagement data is
the zone-level aggregate in engagement_zone_aggregates. No emotion labels —
attending/head-down/phone/stillness are observable behaviour, not affect.

Signals are derived from what the pipeline already produces:
- head pose reuses the proctor pitch heuristic (detector eye landmarks);
  backends without landmarks (the stub) yield None, honestly, not a guess.
- phone_nearby reuses the proctor detector's phone boxes and the same
  nearest-track adjacency rule.
- stillness compares a track's box centre against its previous sighting,
  scaled by the frame diagonal so it is resolution-independent.

Eye closure (EAR) is deliberately absent: InsightFace kps carry no eyelid
points, so an honest EAR is not derivable here. See ADR 0007.
"""

from __future__ import annotations

from dataclasses import dataclass

from proctor.detector import ObjectDetection
from proctor.engine import ProctorEngine
from proctor.suppression import estimate_pitch_deg
from vision.types import Track


@dataclass(frozen=True)
class TrackSignals:
    """One track's behaviour in one frame. None = backend can't tell."""

    attending: bool | None  # head not pitched down past the attention band
    head_down: bool | None
    phone_nearby: bool
    still: bool | None  # None on first sighting (no prior position)


def _centre(track: Track) -> tuple[float, float]:
    x1, y1, x2, y2 = track.det.box
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


class SignalExtractor:
    """Stateful only for movement (last centre per track id) — nothing else
    is remembered between frames, and nothing here is ever written out."""

    def __init__(self, attend_pitch_deg: float = -35.0, still_frac: float = 0.02) -> None:
        self._attend_pitch = attend_pitch_deg
        self._still_frac = still_frac
        self._last_centre: dict[int, tuple[float, float]] = {}

    def extract(
        self,
        tracks: list[Track],
        phone_dets: list[ObjectDetection],
        frame_hw: tuple[int, int],
    ) -> dict[int, TrackSignals]:
        h, w = frame_hw
        still_limit = self._still_frac * (h * h + w * w) ** 0.5
        phone_tracks = {
            t.track_id
            for det in phone_dets
            if (t := ProctorEngine._nearest_track(det, tracks)) is not None
        }
        out: dict[int, TrackSignals] = {}
        for tr in tracks:
            pitch = estimate_pitch_deg(tr.det)
            head_down = None if pitch is None else pitch <= self._attend_pitch
            cx, cy = _centre(tr)
            prev = self._last_centre.get(tr.track_id)
            still = None
            if prev is not None:
                moved = ((cx - prev[0]) ** 2 + (cy - prev[1]) ** 2) ** 0.5
                still = moved <= still_limit
            self._last_centre[tr.track_id] = (cx, cy)
            out[tr.track_id] = TrackSignals(
                attending=None if head_down is None else not head_down,
                head_down=head_down,
                phone_nearby=tr.track_id in phone_tracks,
                still=still,
            )
        return out
