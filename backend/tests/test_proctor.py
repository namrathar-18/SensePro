"""Proctor mode, fully offline (stub detector, fake writer): a phone marker
creates exactly one review flag, a writing-posture (pitched-down) track
suppresses it, person markers raise nothing (the extra-person concept was
removed), a cooldown stops per-frame re-flags, and no row ever carries a
verdict — review_status is 'pending', a human moves it. No network, no models."""

from datetime import UTC, datetime

import cv2
import numpy as np

from proctor.detector import StubProctorDetector
from proctor.engine import ProctorEngine
from proctor.suppression import GazeSuppressor, estimate_pitch_deg
from vision.types import Detection, Track

BLUE = (255, 0, 0)  # stub "cell phone"
GREEN = (0, 255, 0)  # stub "person"

# Eye landmarks for the (130,90)-(190,170) face box: at 40% of box height the
# head reads level; at 55% it reads ~-30 deg (writing posture).
LEVEL_EYES = [(145.0, 122.0), (175.0, 122.0)]
DOWN_EYES = [(145.0, 134.0), (175.0, 134.0)]


def _frame(*blocks: tuple[tuple[int, int, int, int], tuple[int, int, int]]) -> np.ndarray:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    for (x1, y1, x2, y2), colour in blocks:
        cv2.rectangle(img, (x1, y1), (x2, y2), colour, -1)
    return img


def _track(landmarks: list[tuple[float, float]] | None = None) -> Track:
    det = Detection(130, 90, 190, 170, score=0.99, landmarks=landmarks or [])
    return Track(track_id=1, det=det, student_id="s1")


class FakeFlagWriter:
    def __init__(self) -> None:
        self.flags = []

    def create_flag(self, row) -> None:
        self.flags.append(row)


def _engine(writer: FakeFlagWriter, cooldown_s: float = 30.0) -> ProctorEngine:
    return ProctorEngine(
        detector=StubProctorDetector(),
        suppressor=GazeSuppressor(window_s=10.0, pitch_down_deg=-25.0),
        writer=writer,
        session_id="sess-exam",
        session_start=datetime.now(UTC),
        cooldown_s=cooldown_s,
    )


PHONE_NEAR_TRACK = (((200, 140, 240, 180), BLUE),)


def test_phone_marker_creates_pending_review_flag() -> None:
    writer = FakeFlagWriter()
    flags = _engine(writer).observe(_frame(*PHONE_NEAR_TRACK), [_track(LEVEL_EYES)], 1.0)
    assert len(flags) == 1 and writer.flags == flags
    flag = flags[0]
    assert flag.flag_type == "phone"
    assert flag.student_id == "s1"  # attributed to the adjacent track
    assert flag.review_status == "pending"  # rendered "awaiting review"; humans decide


def test_writing_posture_suppresses_phone_flag_until_window_expires() -> None:
    writer = FakeFlagWriter()
    engine = _engine(writer)
    # head pitched down -> candidate suppressed, nothing written
    assert engine.observe(_frame(*PHONE_NEAR_TRACK), [_track(DOWN_EYES)], 1.0) == []
    # still inside the 10s window
    assert engine.observe(_frame(*PHONE_NEAR_TRACK), [_track(LEVEL_EYES)], 5.0) == []
    # window expired, head level -> the flag goes through
    assert len(engine.observe(_frame(*PHONE_NEAR_TRACK), [_track(LEVEL_EYES)], 12.0)) == 1
    assert len(writer.flags) == 1


def test_person_markers_do_not_flag() -> None:
    """The "extra person" concept was removed — person markers raise nothing;
    only phones are proctored now."""
    writer = FakeFlagWriter()
    frame = _frame(((20, 20, 70, 70), GREEN), ((250, 20, 300, 70), GREEN))
    assert _engine(writer).observe(frame, [_track()], 1.0) == []
    assert writer.flags == []


def test_cooldown_stops_per_frame_reflagging() -> None:
    writer = FakeFlagWriter()
    engine = _engine(writer, cooldown_s=30.0)
    frame = _frame(*PHONE_NEAR_TRACK)
    assert len(engine.observe(frame, [_track()], 1.0)) == 1
    assert engine.observe(frame, [_track()], 5.0) == []  # same event, cooling down
    assert len(engine.observe(frame, [_track()], 40.0)) == 1  # cooldown over
    assert len(writer.flags) == 2


def test_face_marker_is_not_a_proctor_object() -> None:
    red_face_only = _frame(((130, 90, 190, 170), (0, 0, 255)))
    assert StubProctorDetector().detect(red_face_only) == []


def test_stub_detector_labels() -> None:
    # Only phones are proctored now; a person marker (green) yields nothing.
    frame = _frame(((10, 10, 60, 60), BLUE), ((100, 100, 150, 150), GREEN))
    labels = {d.label for d in StubProctorDetector().detect(frame)}
    assert labels == {"cell phone"}


def test_flag_row_carries_no_verdict_fields() -> None:
    writer = FakeFlagWriter()
    flags = _engine(writer).observe(_frame(*PHONE_NEAR_TRACK), [_track()], 1.0)
    payload = flags[0].payload()
    assert set(payload) == {
        "id",
        "session_id",
        "student_id",
        "flag_type",
        "flagged_at",
        "review_status",
    }
    assert payload["review_status"] == "pending"


def test_gaze_suppressor_threshold_and_window() -> None:
    sup = GazeSuppressor(window_s=10.0, pitch_down_deg=-25.0)
    sup.note_pitch(1, -10.0, ts=0.0)  # not far enough down
    assert not sup.suppressed(1, 1.0)
    sup.note_pitch(1, -30.0, ts=2.0)
    assert sup.suppressed(1, 11.9)
    assert not sup.suppressed(1, 12.1)
    assert not sup.suppressed(2, 3.0)  # other tracks unaffected


def test_estimate_pitch_from_landmarks() -> None:
    assert estimate_pitch_deg(Detection(0, 0, 60, 80, score=1.0)) is None  # stub: no landmarks
    level = Detection(130, 90, 190, 170, score=1.0, landmarks=LEVEL_EYES)
    down = Detection(130, 90, 190, 170, score=1.0, landmarks=DOWN_EYES)
    assert abs(estimate_pitch_deg(level)) < 1.0
    assert estimate_pitch_deg(down) < -25.0
