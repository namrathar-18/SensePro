"""End-to-end: browser frames -> WS loop -> FSM -> presence writer.

Drives a short synthetic session (stub vision backend, fake writer, zero
network) and asserts the exact upsert sequence the write-path emits:
PRESENT opens, then closes when the student disappears, ABSENT opens, and
session end closes whatever is still open.
"""

import base64

import cv2
import numpy as np
from fastapi.testclient import TestClient

import app.ws as ws_mod
from app.main import app
from vision.embedding_store import EmbeddingStore
from vision.stub import StubDetector, StubEmbedder


def _jpg_b64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def _marker_frame() -> np.ndarray:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (130, 90), (190, 170), (0, 0, 255), -1)
    return img


def _blank_frame() -> np.ndarray:
    return np.full((240, 320, 3), 255, dtype=np.uint8)


class FakeWriter:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, str, bool]] = []  # (op, student, state, has_end)

    def create_session(self, class_section, subject, mode):
        raise AssertionError("ws loop must not create sessions")

    def end_session(self, session_id, ends_at):
        raise AssertionError("ws loop must not end class_sessions rows")

    def open_interval(self, row):
        self.events.append(("open", row.student_id, row.state, row.ended_at is not None))

    def close_interval(self, row):
        self.events.append(("close", row.student_id, row.state, row.ended_at is not None))


def _enrolled_store() -> EmbeddingStore:
    """Enroll the synthetic marker as student s1 using the stub backend itself,
    so live embedding of the same marker matches at cosine ~1.0."""
    frame = _marker_frame()
    det = StubDetector().detect(frame)[0]
    vec = StubEmbedder().embed(frame, det)
    store = EmbeddingStore(threshold=0.45)
    store.add("s1", vec)
    return store


def test_ws_session_emits_correct_upsert_sequence(monkeypatch) -> None:
    fake = FakeWriter()
    monkeypatch.setattr(ws_mod, "build_writer", lambda: fake)
    monkeypatch.setattr(ws_mod, "_load_store", _enrolled_store)
    monkeypatch.setattr("app.config.settings.reid_interval_s", 0.0)
    monkeypatch.setattr("app.config.settings.miss_threshold", 1)

    client = TestClient(app)
    with client.websocket_connect("/ws/capture?session_id=sess-test") as sock:
        # t=0: marker visible -> s1 PRESENT
        sock.send_json({"type": "frame", "ts": 0.0, "jpg_b64": _jpg_b64(_marker_frame())})
        r1 = sock.receive_json()
        # present is enriched to {student_id,name,reg_no,first_seen_ts} rows.
        assert [p["student_id"] for p in r1["present"]] == ["s1"]

        # t=1: marker gone -> one miss >= threshold -> ABSENT
        sock.send_json({"type": "frame", "ts": 1.0, "jpg_b64": _jpg_b64(_blank_frame())})
        r2 = sock.receive_json()
        assert r2["present"] == []

        sock.send_json({"type": "end", "ts": 2.0})
        assert sock.receive_json()["type"] == "session_ended"

    assert fake.events == [
        ("open", "s1", "PRESENT", False),  # recognised -> PRESENT interval opens
        ("close", "s1", "PRESENT", True),  # disappears -> PRESENT closes...
        ("open", "s1", "ABSENT", False),  # ...and ABSENT opens
        ("close", "s1", "ABSENT", True),  # session end closes the open interval
    ]


def test_ws_without_session_id_never_touches_writer(monkeypatch) -> None:
    fake = FakeWriter()
    monkeypatch.setattr(ws_mod, "build_writer", lambda: fake)
    monkeypatch.setattr("app.config.settings.reid_interval_s", 0.0)

    client = TestClient(app)
    with client.websocket_connect("/ws/capture") as sock:
        sock.send_json({"type": "frame", "ts": 0.0, "jpg_b64": _jpg_b64(_marker_frame())})
        sock.receive_json()
        sock.send_json({"type": "end", "ts": 1.0})
        sock.receive_json()

    assert fake.events == []  # offline stub loop persists nothing
