"""Per-session vision pipeline.

detect (every frame) -> track (every frame) -> re-identify (per track, on an
interval) -> drive the presence FSM. One instance per active class session.
"""

from __future__ import annotations

import numpy as np

from presence.fsm import PresenceFSM
from vision.embedding_store import EmbeddingStore
from vision.tracker import IoUTracker
from vision.types import Track

# The InsightFace model pack (~300 MB) is loaded ONCE and reused across every
# session/connection. Reloading it per WebSocket froze the event loop for
# ~5-10s each time, which tripped the WS keepalive and thrashed reconnects.
_INSIGHTFACE_SINGLETON = None


def build_backend():
    """Factory selected by settings.vision_backend (stub | insightface). Reads
    the SAME config source as the rest of the app — VISION_BACKEND from the
    environment OR the backend/.env file. (Previously this used os.getenv
    directly, so a plain `.env` launch silently fell back to the stub while
    /health still reported insightface.) The insightface backend is a
    process-wide singleton so the model loads only once."""
    from app.config import settings

    backend = settings.vision_backend.lower()
    if backend == "insightface":
        global _INSIGHTFACE_SINGLETON
        if _INSIGHTFACE_SINGLETON is None:
            from vision.insightface_backend import InsightFaceBackend

            _INSIGHTFACE_SINGLETON = InsightFaceBackend()
        return _INSIGHTFACE_SINGLETON, _INSIGHTFACE_SINGLETON
    from vision.stub import StubDetector, StubEmbedder

    return StubDetector(), StubEmbedder()


class SessionPipeline:
    def __init__(
        self,
        store: EmbeddingStore,
        reid_interval_s: float = 30.0,
        miss_threshold: int = 3,
        latch: bool = False,
    ) -> None:
        self.detector, self.embedder = build_backend()
        self.tracker = IoUTracker()
        self.store = store
        self.fsm = PresenceFSM(miss_threshold=miss_threshold, latch=latch)
        self.reid_interval_s = reid_interval_s
        self._last_reid_pass = -1e9
        self.last_tracks: list[Track] = []

    def process_frame(self, frame_bgr: np.ndarray, ts: float) -> dict:
        dets = self.detector.detect(frame_bgr)
        tracks = self.tracker.update(dets)
        # Exposed for frame observers (proctor/engagement) so they can reuse
        # this frame's tracks instead of re-running detection.
        self.last_tracks = tracks

        # Immediately identify any track that has no identity yet — a NEW track,
        # e.g. after the camera moved and the old track was lost. This keeps
        # recognition sticky while the frame moves instead of waiting for the
        # next periodic pass (the reason a moved face read as "unknown").
        for tr in tracks:
            if tr.student_id is None:
                vec = self.embedder.embed(frame_bgr, tr.det)
                sid, score = self.store.match(vec)
                tr.student_id, tr.match_score, tr.last_reid_ts = sid, score, ts

        # Periodic re-confirmation of all tracks' identity.
        do_reid = (ts - self._last_reid_pass) >= self.reid_interval_s
        if do_reid:
            for tr in tracks:
                if (tr.last_reid_ts is None) or (ts - tr.last_reid_ts >= self.reid_interval_s):
                    vec = self.embedder.embed(frame_bgr, tr.det)
                    sid, score = self.store.match(vec)
                    tr.student_id, tr.match_score, tr.last_reid_ts = sid, score, ts
            self._last_reid_pass = ts

        # Drive the presence FSM. In roll-call latch mode (single webcam panning
        # a room) observe EVERY frame, so a face that is only briefly in view is
        # marked PRESENT the instant it's recognised — latching means this only
        # ever promotes newly-seen students, never un-marks anyone. In decay mode
        # observe only on the re-ID tick (miss_threshold counts re-ID passes).
        transitions: list[tuple[str, str]] = []
        if self.fsm.latch or do_reid:
            seen = {t.student_id for t in tracks if t.student_id}
            transitions = self.fsm.observe(seen, self.store.roster, ts)

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
