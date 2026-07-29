"""Production vision backend: InsightFace (SCRFD detector + ArcFace embedder).

Imported lazily and only when VISION_BACKEND=insightface, so the stub path has
zero heavy dependencies. Install with:  pip install -e '.[insightface]'

NOTE (project invariant): no training here. We load the pretrained buffalo_l
pack and compute embeddings only.
"""

from __future__ import annotations

import numpy as np

from vision.types import Detection

EMB_DIM = 512


class InsightFaceBackend:
    def __init__(self, det_size: int = 640) -> None:
        from insightface.app import FaceAnalysis  # lazy

        self.app = FaceAnalysis(name="buffalo_l")
        self.app.prepare(ctx_id=0, det_size=(det_size, det_size))
        self._faces_cache: list = []

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        faces = self.app.get(frame_bgr)
        self._faces_cache = faces
        dets: list[Detection] = []
        for f in faces:
            x1, y1, x2, y2 = f.bbox
            lmk = [(float(p[0]), float(p[1])) for p in getattr(f, "kps", [])]
            dets.append(
                Detection(
                    float(x1),
                    float(y1),
                    float(x2),
                    float(y2),
                    score=float(f.det_score),
                    landmarks=lmk,
                )
            )
        return dets

    def embed(self, frame_bgr: np.ndarray, det: Detection) -> np.ndarray:
        # Match the detection back to the cached face by bbox proximity.
        best, best_d = None, 1e9
        for f in self._faces_cache:
            fx = (f.bbox[0] + f.bbox[2]) / 2
            fy = (f.bbox[1] + f.bbox[3]) / 2
            cx = (det.x1 + det.x2) / 2
            cy = (det.y1 + det.y2) / 2
            d = (fx - cx) ** 2 + (fy - cy) ** 2
            if d < best_d:
                best, best_d = f, d
        if best is None:
            return np.zeros(EMB_DIM, dtype=np.float32)
        v = np.asarray(best.normed_embedding, dtype=np.float32)
        return v
