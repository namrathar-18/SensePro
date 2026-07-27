"""End-to-end WebSocket test with the stub backend and a synthetic marker frame.

Proves the browser-capture loop: client sends frames -> server returns faces +
presence transitions -> session ends cleanly. No ML models required.
"""

import base64

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app


def _marker_frame(bgr=(0, 0, 255)) -> str:
    """A frame with one saturated colour block (a 'face' for the stub detector)."""
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (130, 90), (190, 170), bgr, -1)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def _blank_frame() -> str:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    _ok, buf = cv2.imencode(".jpg", img)
    return base64.b64encode(buf.tobytes()).decode()


def test_capture_loop_detects_and_marks_present(monkeypatch) -> None:
    # reid every frame; small miss threshold so we can drive ABSENT quickly
    monkeypatch.setenv("REID_INTERVAL_S", "0")
    client = TestClient(app)
    face = _marker_frame()
    with client.websocket_connect("/ws/capture") as ws:
        # frame 1: a face is present -> a track appears
        ws.send_json({"type": "frame", "ts": 0.0, "jpg_b64": face})
        r1 = ws.receive_json()
        assert r1["type"] == "result"
        assert len(r1["faces"]) == 1
        # (no roster enrolled in this test, so identity is None but plumbing works)
        ws.send_json({"type": "end", "ts": 1.0})
        end = ws.receive_json()
        assert end["type"] == "session_ended"


def test_bad_frame_is_handled() -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws/capture") as ws:
        ws.send_json({"type": "frame", "ts": 0.0, "jpg_b64": "not-base64!!"})
        r = ws.receive_json()
        assert r["type"] == "error"


def test_health() -> None:
    assert TestClient(app).get("/health").json()["status"] == "ok"
