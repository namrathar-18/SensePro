"""Eval harness on synthetic data: recognition/duration arithmetic on a
scripted marker clip, and the gaze-filter ON/OFF comparison with scripted
head pitch — proving the FP-reduction measurement without video or models."""

from datetime import UTC, datetime

import cv2
import numpy as np

from app.store import NoopWriter
from eval.harness import ProctorResult, eval_presence, eval_proctor, fp_reduction
from proctor.detector import StubProctorDetector
from proctor.engine import ProctorEngine
from proctor.suppression import GazeSuppressor
from vision.embedding_store import EmbeddingStore
from vision.pipeline import SessionPipeline
from vision.stub import StubDetector, StubEmbedder
from vision.types import Detection, Track

LEVEL_EYES = [(145.0, 122.0), (175.0, 122.0)]  # 40% of the face box: level
DOWN_EYES = [(145.0, 134.0), (175.0, 134.0)]  # 55%: pitched down (~-30 deg)


def _marker_frame() -> np.ndarray:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (130, 90), (190, 170), (0, 0, 255), -1)
    return img


def _blank_frame() -> np.ndarray:
    return np.full((240, 320, 3), 255, dtype=np.uint8)


def _phone_frame() -> np.ndarray:
    img = np.full((240, 320, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (200, 140), (240, 180), (255, 0, 0), -1)  # blue = stub phone
    return img


def _enrolled_pipeline() -> SessionPipeline:
    frame = _marker_frame()
    det = StubDetector().detect(frame)[0]
    vec = StubEmbedder().embed(frame, det)
    store = EmbeddingStore(threshold=0.45)
    store.add("s1", vec)
    return SessionPipeline(store=store, reid_interval_s=0.0, miss_threshold=1)


def test_presence_metrics_on_synthetic_clip() -> None:
    # s1 visible for the first second (10 frames at 10 fps), then gone
    frames = [(_marker_frame(), i / 10) for i in range(10)]
    frames += [(_blank_frame(), 1.0 + i / 10) for i in range(10)]
    truth = {"s1": [[0.0, 0.95]]}

    result = eval_presence(frames, _enrolled_pipeline(), truth)

    assert result.hit_rate["s1"] == 1.0  # recognised in every truth-present frame
    assert abs(result.measured_s["s1"] - 1.0) < 1e-9  # integrated over frame gaps
    assert result.error_s("s1") < 0.1  # 0.05s off the 0.95s truth


class ScriptedPipeline:
    """Eval only needs process_frame + last_tracks. Head pitch is scripted by
    time: level while the phone is truly out, writing posture afterwards."""

    def __init__(self) -> None:
        self.last_tracks: list[Track] = []

    def process_frame(self, frame, ts: float) -> dict:
        eyes = LEVEL_EYES if ts < 0.5 else DOWN_EYES
        det = Detection(130, 90, 190, 170, score=0.99, landmarks=eyes)
        self.last_tracks = [Track(track_id=1, det=det, student_id="s1")]
        return {"type": "result", "ts": ts, "faces": [], "transitions": [], "present": []}


def _eval_engine(filter_on: bool) -> ProctorEngine:
    return ProctorEngine(
        detector=StubProctorDetector(),
        suppressor=GazeSuppressor(window_s=10.0, pitch_down_deg=-25.0 if filter_on else -1e9),
        writer=NoopWriter(),
        session_id="eval",
        session_start=datetime.now(UTC),
        cooldown_s=0.0,  # eval counts every candidate
    )


def test_gaze_filter_measurably_cuts_false_positives() -> None:
    # A phone marker sits in frame the whole clip; truth says it was really
    # out only for the first 0.45s. From 0.5s the student is writing.
    frames = [(_phone_frame(), i / 5) for i in range(11)]  # ts 0.0 .. 2.0
    truth = {"phone_windows": [[0.0, 0.45]]}

    on = eval_proctor(frames, ScriptedPipeline(), _eval_engine(True), truth)
    off = eval_proctor(frames, ScriptedPipeline(), _eval_engine(False), truth)

    assert on.tp == off.tp == 3  # ts 0.0, 0.2, 0.4 — real phone, level head
    assert off.fp == 8  # every writing-posture frame flags without the filter
    assert on.fp == 0  # the filter suppresses all of them
    assert fp_reduction(off, on) == 1.0


def test_fp_reduction_guards_zero_division() -> None:
    assert fp_reduction(ProctorResult(tp=1, fp=0), ProctorResult(tp=1, fp=0)) == 0.0
