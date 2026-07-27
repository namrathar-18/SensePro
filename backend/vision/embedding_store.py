"""In-memory cosine matcher over enrolled embeddings.

Loaded from an enrolment JSON (produced by the enrol CLI) or from Supabase
pgvector in production. Embeddings are L2-normalised, so cosine == dot product.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


class EmbeddingStore:
    def __init__(self, threshold: float = 0.45) -> None:
        self.threshold = threshold
        self._ids: list[str] = []
        self._mat: np.ndarray | None = None  # (N, D), L2-normalised

    def add(self, student_id: str, vec: np.ndarray) -> None:
        v = _l2(vec).astype(np.float32)
        self._ids.append(student_id)
        self._mat = v[None, :] if self._mat is None else np.vstack([self._mat, v])

    def match(self, vec: np.ndarray) -> tuple[str | None, float]:
        if self._mat is None or not len(self._ids):
            return None, 0.0
        sims = self._mat @ _l2(vec).astype(np.float32)
        i = int(np.argmax(sims))
        score = float(sims[i])
        return (self._ids[i], score) if score >= self.threshold else (None, score)

    @property
    def roster(self) -> set[str]:
        return set(self._ids)

    @classmethod
    def from_json(cls, path: str | Path, threshold: float = 0.45) -> EmbeddingStore:
        store = cls(threshold)
        data = json.loads(Path(path).read_text())
        for sid, vecs in data.items():
            for v in vecs:
                store.add(sid, np.asarray(v, dtype=np.float32))
        return store


def _l2(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v
