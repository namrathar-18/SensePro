"""Turns exam-mode detections into human review-queue items.

This engine ASSISTS an invigilator; it never judges. Every candidate event
becomes a proctor_flags row whose review_status is 'pending' (rendered as
"awaiting review" in every UI) and only a human moves it to dismissed or
upheld. There is no auto-penalty path and no verdict field anywhere here.

Per frame: feed each track's head pitch to the gaze suppressor (landmarks
come from the real vision backend; the stub has none, so tests drive the
suppressor directly), then detect phones. A phone is attributed to the
nearest track within adjacency range — if that track recently looked down
(writing posture), the candidate is suppressed. A per-key cooldown stops the
same event re-flagging every sampled frame. (The "extra person" flag was
removed: body-vs-face counts were unreliable under camera motion.)
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
    # reg_no -> students.id (UUID). Tracks identify students by register number,
    # but proctor_flags.student_id is the UUID FK — without this map every
    # attributed flag is rejected by the DB and dropped. Empty = write ids as-is
    # (offline/stub loop, which persists nothing anyway).
    student_id_map: dict[str, str] = field(default_factory=dict)
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
        # Translate the track's reg_no to the students.id UUID for the FK. If a
        # map is present but the reg_no isn't in it, record the event unattributed
        # (student_id=None) rather than letting the DB reject the whole flag.
        reg_no = track.student_id if track else None
        if reg_no is not None and self.student_id_map:
            db_id = self.student_id_map.get(reg_no)
        else:
            db_id = reg_no
        row = ProctorFlagRow(
            session_id=self.session_id,
            flag_type=flag_type,
            flagged_at=self.session_start + timedelta(seconds=rel_ts),
            student_id=db_id,
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
