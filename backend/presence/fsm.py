"""Presence state machine. PRESENT -> UNVERIFIED -> ABSENT per student.

Driven once per re-identification pass with the set of student_ids matched in
that pass. Timestamps are injected (epoch seconds) for deterministic tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field

PRESENT = "PRESENT"
UNVERIFIED = "UNVERIFIED"
ABSENT = "ABSENT"


@dataclass
class Interval:
    student_id: str
    state: str
    started_at: float
    ended_at: float | None = None


@dataclass
class _Track:
    state: str = ABSENT
    misses: int = 0
    open_interval: Interval | None = None


@dataclass
class PresenceFSM:
    miss_threshold: int = 3
    _tracks: dict[str, _Track] = field(default_factory=dict)
    intervals: list[Interval] = field(default_factory=list)

    def observe(self, seen_ids: set[str], roster: set[str], ts: float) -> list[tuple[str, str]]:
        transitions: list[tuple[str, str]] = []
        for sid in roster:
            tr = self._tracks.setdefault(sid, _Track())
            if sid in seen_ids:
                tr.misses = 0
                if tr.state != PRESENT:
                    self._close(tr, ts)
                    tr.state = PRESENT
                    tr.open_interval = Interval(sid, PRESENT, ts)
                    transitions.append((sid, PRESENT))
            else:
                tr.misses += 1
                if tr.state == PRESENT and tr.misses < self.miss_threshold:
                    self._close(tr, ts)
                    tr.state = UNVERIFIED
                    tr.open_interval = Interval(sid, UNVERIFIED, ts)
                    transitions.append((sid, UNVERIFIED))
                elif tr.state in (PRESENT, UNVERIFIED) and tr.misses >= self.miss_threshold:
                    self._close(tr, ts)
                    tr.state = ABSENT
                    tr.open_interval = None
                    transitions.append((sid, ABSENT))
        return transitions

    def end_session(self, ts: float) -> None:
        for tr in self._tracks.values():
            self._close(tr, ts)
            tr.open_interval = None

    def present_seconds(self, sid: str) -> float:
        return sum(
            (iv.ended_at - iv.started_at)
            for iv in self.intervals
            if iv.student_id == sid and iv.state == PRESENT and iv.ended_at is not None
        )

    def state_of(self, sid: str) -> str:
        return self._tracks.get(sid, _Track()).state

    def _close(self, tr: _Track, ts: float) -> None:
        if tr.open_interval is not None and tr.open_interval.ended_at is None:
            tr.open_interval.ended_at = ts
            self.intervals.append(tr.open_interval)
