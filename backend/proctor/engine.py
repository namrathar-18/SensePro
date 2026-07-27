"""Turns exam-mode detections into human review-queue items.

This engine ASSISTS an invigilator; it never judges. Every candidate event
becomes a proctor_flags row whose review_status is 'pending' (rendered as
"awaiting review" in every UI) and only a human moves it to dismissed or
upheld. There is no auto-penalty path and no verdict field anywhere here.

Per frame: feed each track's head pitch to the gaze suppressor (landmarks
come from the real vision backend; the stub has none, so tests drive the
suppressor directly), then detect objects. A phone is attributed to the
nearest track within adjacency range — if that track recently looked down
(writing posture), the candidate is suppressed. More detected persons than
tracked faces raises one extra_person flag. A per-key cooldown stops the same
event re-flagging every sampled frame.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.store import PresenceWriter, ProctorFlagRow
from proctor.detector import ObjectDetection, ObjectDetector
from proctor.suppression import GazeSuppressor, estimate_pitch_deg
from vision.types import Track

# A phone belongs to a track when their centres are within this many track
# diagonals — "in that student's reach", scale-free across resolutions.
_ADJACENCY_DIAGONALS = 1.5


def _centre(box: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


@dataclass
class ProctorEngine:
    detector: ObjectDetector
    suppressor: GazeSuppressor
    writer: PresenceWriter
    session_id: str
    session_start: datetime
    cooldown_s: float = 30.0
    _last_flag: dict[tuple[str, int | None], float] = field(default_factory=dict)

    def observe(
        self,
        frame_bgr,
        tracks: list[Track],
        rel_ts: float,
        detections: list[ObjectDetection] | None = None,
    ) -> list[ProctorFlagRow]:
        """Run one exam-mode pass; returns the flags actually written.
        Pass `detections` to reuse a detector pass already run on this frame
        (the session runner shares one pass between proctor and engagement)."""
        for tr in tracks:
            pitch = estimate_pitch_deg(tr.det)
            if pitch is not None:
                self.suppressor.note_pitch(tr.track_id, pitch, rel_ts)

        if detections is None:
            detections = self.detector.detect(frame_bgr)
        written: list[ProctorFlagRow] = []
        for det in detections:
            if det.label == "cell phone":
                flag = self._phone_candidate(det, tracks, rel_ts)
                if flag is not None:
                    written.append(flag)
        n_persons = sum(1 for d in detections if d.label == "person")
        if n_persons > len(tracks):
            flag = self._flag("extra_person", None, rel_ts)
            if flag is not None:
                written.append(flag)
        return written

    def _phone_candidate(
        self, det: ObjectDetection, tracks: list[Track], rel_ts: float
    ) -> ProctorFlagRow | None:
        track = self._nearest_track(det, tracks)
        if track is not None and self.suppressor.suppressed(track.track_id, rel_ts):
            return None  # writing posture in the window — the FP filter at work
        return self._flag("phone", track, rel_ts)

    def _flag(self, flag_type: str, track: Track | None, rel_ts: float) -> ProctorFlagRow | None:
        key = (flag_type, track.track_id if track else None)
        last = self._last_flag.get(key)
        if last is not None and (rel_ts - last) < self.cooldown_s:
            return None
        self._last_flag[key] = rel_ts
        row = ProctorFlagRow(
            session_id=self.session_id,
            flag_type=flag_type,
            flagged_at=self.session_start + timedelta(seconds=rel_ts),
            student_id=track.student_id if track else None,
        )
        self.writer.create_flag(row)
        return row

    @staticmethod
    def _nearest_track(det: ObjectDetection, tracks: list[Track]) -> Track | None:
        best: tuple[float, Track] | None = None
        cx, cy = _centre(det.box)
        for tr in tracks:
            tx, ty = _centre(tr.det.box)
            x1, y1, x2, y2 = tr.det.box
            diagonal = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            dist = ((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5
            if dist <= _ADJACENCY_DIAGONALS * max(diagonal, 1.0) and (
                best is None or dist < best[0]
            ):
                best = (dist, tr)
        return best[1] if best else None
