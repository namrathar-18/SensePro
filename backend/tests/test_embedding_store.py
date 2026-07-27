import numpy as np

from vision.embedding_store import EmbeddingStore


def test_match_above_threshold() -> None:
    s = EmbeddingStore(threshold=0.45)
    s.add("s1", np.array([1, 0, 0], dtype=np.float32))
    s.add("s2", np.array([0, 1, 0], dtype=np.float32))
    sid, score = s.match(np.array([0.9, 0.1, 0.0], dtype=np.float32))
    assert sid == "s1" and score > 0.45


def test_no_match_below_threshold() -> None:
    s = EmbeddingStore(threshold=0.95)
    s.add("s1", np.array([1, 0, 0], dtype=np.float32))
    sid, _ = s.match(np.array([0.5, 0.5, 0.7], dtype=np.float32))
    assert sid is None
