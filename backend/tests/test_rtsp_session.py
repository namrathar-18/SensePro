"""Phase-3 capture, fully offline: a fake frame source drives run_loop and the
presence writer sees the exact open/close sequence (proves the RTSP wiring
without a camera), a fake cv2.VideoCapture proves reconnect-with-backoff, and
the URL masker never leaks a password. Stub vision backend, zero network."""

import time
from datetime import UTC, datetime

import cv2
import numpy as np

from app.store import SessionRecorder
from capture.rtsp_source import RtspSource, mask_rtsp_url
from capture.run_session import _parse_enrolled, build_observers, run_loop
from vision.embedding_store import EmbeddingStore
from vision.pipeline import SessionPipeline
from vision.stub import StubDetector, StubEmbedder


def _marker_frame() -> np.ndarray:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (130, 90), (190, 170), (0, 0, 255), -1)
    return img


def _blank_frame() -> np.ndarray:
    return np.full((240, 320, 3), 255, dtype=np.uint8)


def _enrolled_store() -> EmbeddingStore:
    frame = _marker_frame()
    det = StubDetector().detect(frame)[0]
    vec = StubEmbedder().embed(frame, det)
    store = EmbeddingStore(threshold=0.45)
    store.add("s1", vec)
    return store


class FakeWriter:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, str, bool]] = []
        self.flags = []
        self.aggregates = []

    def create_session(self, class_section, subject, mode):
        raise AssertionError("the runner must not create sessions")

    def end_session(self, session_id, ends_at):
        raise AssertionError("the runner must not end class_sessions rows")

    def open_interval(self, row):
        self.events.append(("open", row.student_id, row.state, row.ended_at is not None))

    def close_interval(self, row):
        self.events.append(("close", row.student_id, row.state, row.ended_at is not None))

    def create_flag(self, row):
        self.flags.append(row)

    def create_zone_aggregate(self, row):
        self.aggregates.append(row)


class FakeSource:
    """Replays a frame script; each latest() call advances one frame."""

    def __init__(self, frames: list[np.ndarray]) -> None:
        self._frames = frames
        self._calls = 0
        self.stopped = False

    def latest(self):
        i = min(self._calls, len(self._frames) - 1)
        self._calls += 1
        return self._frames[i], float(self._calls)

    def stop(self) -> None:
        self.stopped = True


def _fake_clock():
    t = {"now": 0.0}

    def clock() -> float:
        t["now"] += 0.25
        return t["now"]

    return clock


def test_run_loop_drives_presence_writer() -> None:
    fake = FakeWriter()
    recorder = SessionRecorder(
        writer=fake, session_id="sess-rtsp", session_start=datetime.now(UTC)
    )
    pipeline = SessionPipeline(store=_enrolled_store(), reid_interval_s=0.0, miss_threshold=1)
    source = FakeSource([_marker_frame(), _blank_frame()])

    n = run_loop(
        source,
        pipeline,
        recorder,
        sample_fps=2.0,
        clock=_fake_clock(),
        sleep=lambda s: None,
        max_frames=2,
    )

    assert n == 2
    assert source.stopped
    assert fake.events == [
        ("open", "s1", "PRESENT", False),  # marker seen -> PRESENT opens
        ("close", "s1", "PRESENT", True),  # marker gone -> PRESENT closes...
        ("open", "s1", "ABSENT", False),  # ...ABSENT opens
        ("close", "s1", "ABSENT", True),  # loop exit closes whatever is open
    ]


def test_run_loop_without_recorder_is_pure_inference() -> None:
    pipeline = SessionPipeline(store=_enrolled_store(), reid_interval_s=0.0, miss_threshold=1)
    source = FakeSource([_marker_frame()])
    n = run_loop(
        source,
        pipeline,
        None,
        sample_fps=2.0,
        clock=_fake_clock(),
        sleep=lambda s: None,
        max_frames=1,
    )
    assert n == 1 and source.stopped


class FlakyCapture:
    """isOpened() ok; read() fails the first `fail_reads` calls, then streams."""

    def __init__(self, fail_reads: int) -> None:
        self.fail_reads = fail_reads
        self.reads = 0
        self.released = 0

    def isOpened(self) -> bool:
        return True

    def read(self):
        self.reads += 1
        if self.reads <= self.fail_reads:
            return False, None
        return True, np.zeros((4, 4, 3), dtype=np.uint8)

    def release(self) -> None:
        self.released += 1


def test_rtsp_source_reconnects_after_read_failure() -> None:
    made: list[FlakyCapture] = []

    def factory(url: str) -> FlakyCapture:
        cap = FlakyCapture(fail_reads=1 if not made else 0)
        made.append(cap)
        return cap

    source = RtspSource("rtsp://u:pw@cam/x", capture_factory=factory, backoff_base_s=0.001)
    source.start()
    try:
        deadline = time.monotonic() + 2.0
        while source.latest() is None and time.monotonic() < deadline:
            time.sleep(0.005)
        assert source.latest() is not None, "source never recovered"
        assert source.state == "CONNECTED"
        assert len(made) == 2, "failed capture must be released and reopened"
        assert made[0].released == 1
    finally:
        source.stop()


def test_exam_mode_wiring_flags_phone_and_holds_k_floor() -> None:
    """End-to-end runner wiring: exam mode runs the proctor engine off the
    pipeline's tracks (a phone marker gets flagged) and engagement stays
    suppressed below the k-floor — all through run_loop, zero network."""
    writer = FakeWriter()
    pipeline = SessionPipeline(store=_enrolled_store(), reid_interval_s=0.0, miss_threshold=1)
    start = datetime.now(UTC)
    recorder = SessionRecorder(writer=writer, session_id="sess-exam", session_start=start)
    observers, aggregator = build_observers(
        mode="exam",
        pipeline=pipeline,
        writer=writer,
        session_id="sess-exam",
        session_start=start,
        enrolled_by_zone={"front": 10, "mid": 10, "back": 10},
    )
    frame = _marker_frame()  # red face marker (s1)...
    cv2.rectangle(frame, (240, 150), (280, 190), (255, 0, 0), -1)  # ...plus a blue "phone"

    run_loop(
        FakeSource([frame, frame]),
        pipeline,
        recorder,
        sample_fps=2.0,
        observers=observers,
        clock=_fake_clock(),
        sleep=lambda s: None,
        max_frames=2,
    )

    assert any(f.flag_type == "phone" for f in writer.flags)
    assert all(f.review_status == "pending" for f in writer.flags)  # review-only, always
    assert aggregator.flush() == [] and writer.aggregates == []  # n<5 -> suppressed


def test_parse_enrolled_even_split_and_explicit_spec() -> None:
    assert _parse_enrolled("", 53) == {"front": 18, "mid": 18, "back": 17}
    assert _parse_enrolled("front=20,mid=20,back=13", 53) == {"front": 20, "mid": 20, "back": 13}


def test_mask_rtsp_url_hides_password() -> None:
    masked = mask_rtsp_url("rtsp://admin:S3cret!@192.168.1.15:554/cam/realmonitor?channel=1")
    assert "S3cret!" not in masked
    assert masked == "rtsp://admin:****@192.168.1.15:554/cam/realmonitor?channel=1"
    # nothing to mask -> unchanged
    assert mask_rtsp_url("rtsp://192.168.1.15:554/cam") == "rtsp://192.168.1.15:554/cam"
