"""Per-session vision pipeline.

detect (every frame) -> track (every frame) -> re-identify (per track, on an
interval) -> drive the presence FSM. One instance per active class session.
"""

from __future__ import annotations

import os

import numpy as np

from presence.fsm import PresenceFSM
from vision.embedding_store import EmbeddingStore
from vision.tracker import IoUTracker
from vision.types import Track


def build_backend():
    """Factory selected by VISION_BACKEND (stub | insightface)."""
    backend = os.getenv("VISION_BACKEND", "stub").lower()
    if backend == "insightface":
        from vision.insightface_backend import InsightFaceBackend

        b = InsightFaceBackend()
        return b, b  # detector, embedder are the same object
    from vision.stub import StubDetector, StubEmbedder

    return StubDetector(), StubEmbedder()


class SessionPipeline:
    def __init__(
        self,
        store: EmbeddingStore,
        reid_interval_s: float = 30.0,
        miss_threshold: int = 3,
    ) -> None:
        self.detector, self.embedder = build_backend()
        self.tracker = IoUTracker()
        self.store = store
        self.fsm = PresenceFSM(miss_threshold=miss_threshold)
        self.reid_interval_s = reid_interval_s
        self._last_reid_pass = -1e9
        self.last_tracks: list[Track] = []

    def process_frame(self, frame_bgr: np.ndarray, ts: float) -> dict:
        dets = self.detector.detect(frame_bgr)
        tracks = self.tracker.update(dets)
        # Exposed for frame observers (proctor/engagement) so they can reuse
        # this frame's tracks instead of re-running detection.
        self.last_tracks = tracks

        do_reid = (ts - self._last_reid_pass) >= self.reid_interval_s
        transitions: list[tuple[str, str]] = []
        if do_reid:
            for tr in tracks:
                if (tr.last_reid_ts is None) or (ts - tr.last_reid_ts >= self.reid_interval_s):
                    vec = self.embedder.embed(frame_bgr, tr.det)
                    sid, score = self.store.match(vec)
                    tr.student_id, tr.match_score, tr.last_reid_ts = sid, score, ts
            seen = {t.student_id for t in tracks if t.student_id}
            transitions = self.fsm.observe(seen, self.store.roster, ts)
            self._last_reid_pass = ts

        return {
            "type": "result",
            "ts": ts,
            "faces": [self._face_json(t) for t in tracks],
            "transitions": [{"student_id": s, "state": st} for s, st in transitions],
            "present": sorted(s for s in self.store.roster if self.fsm.state_of(s) == "PRESENT"),
        }

    @staticmethod
    def _face_json(t: Track) -> dict:
        x1, y1, x2, y2 = t.det.box
        return {
            "track_id": t.track_id,
            "box": [x1, y1, x2, y2],
            "student_id": t.student_id,
            "score": round(t.match_score, 3),
        }
