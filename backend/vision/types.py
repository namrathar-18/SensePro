"""Shared vision datatypes."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    landmarks: list[tuple[float, float]] = field(default_factory=list)

    @property
    def face_px_height(self) -> float:
        return self.y2 - self.y1

    @property
    def box(self) -> tuple[int, int, int, int]:
        return int(self.x1), int(self.y1), int(self.x2), int(self.y2)


@dataclass
class Track:
    track_id: int
    det: Detection
    age: int = 0  # frames seen
    misses: int = 0  # consecutive frames not matched
    last_reid_ts: float | None = None
    student_id: str | None = None
    match_score: float = 0.0
