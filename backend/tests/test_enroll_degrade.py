"""Degrade-augmentation: a clean enrolment frame yields extra low-res templates.

Runs on the dependency-free stub backend, where a saturated colour block is a
"face". The block is given a noisy value channel so its crop clears the enrol
blur-gate, while its constant hue keeps the stub embedding non-degenerate.
"""

import cv2
import numpy as np

from enroll.pipeline import Enroller


def _textured_marker(h: int = 160, w: int = 160, hue: int = 60) -> np.ndarray:
    """One sharp, saturated colour block on a white background."""
    rng = np.random.default_rng(7)
    block_hsv = np.empty((h, w, 3), dtype=np.uint8)
    block_hsv[..., 0] = hue
    block_hsv[..., 1] = 255
    block_hsv[..., 2] = rng.integers(150, 256, size=(h, w), dtype=np.uint8)
    block = cv2.cvtColor(block_hsv, cv2.COLOR_HSV2BGR)

    frame = np.full((360, 480, 3), 255, dtype=np.uint8)
    frame[100 : 100 + h, 160 : 160 + w] = block
    return frame


def test_degrade_yields_more_embeddings() -> None:
    frame = _textured_marker()

    base = Enroller(degrade=False).enroll_frames([frame])
    aug = Enroller(degrade=True, degrade_heights=(96, 64)).enroll_frames([frame])

    assert len(base) >= 1  # the clean frame passes the quality gate
    assert len(aug) > len(base)  # multi-template: strictly more embeddings
    assert len(aug) == len(base) * 3  # clean + one variant per degrade height

    for emb in aug:
        assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-5
