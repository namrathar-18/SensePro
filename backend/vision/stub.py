"""Deterministic, dependency-free vision backend for dev / CI / tests.

A saturated colour block in the frame is treated as a "face" (the synthetic
stand-in for a real person). Its *dominant hue* — robust to bounding-box jitter
and to non-saturated features drawn inside it — seeds a deterministic embedding,
so the same coloured marker always embeds to the same vector and is therefore
recognisable across frames and between enrolment and live capture. Different
students use different marker colours.

Production swaps these for SCRFD + ArcFace via the same Detector/Embedder
protocols; nothing else in the system changes.
"""

from __future__ import annotations

import cv2
import numpy as np

from vision.types import Detection

EMB_DIM = 64


class StubDetector:
    def __init__(self, min_area: int = 400) -> None:
        self.min_area = min_area

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        _, mask = cv2.threshold(hsv[:, :, 1], 120, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        dets: list[Detection] = []
        for c in contours:
            if cv2.contourArea(c) < self.min_area:
                continue
            x, y, w, h = cv2.boundingRect(c)
            dets.append(Detection(x, y, x + w, y + h, score=0.99))
        return dets


class StubEmbedder:
    """Embedding seeded by the dominant hue of saturated pixels in the crop."""

    def embed(self, frame_bgr: np.ndarray, det: Detection) -> np.ndarray:
        x1, y1, x2, y2 = det.box
        crop = frame_bgr[max(0, y1) : max(1, y2), max(0, x1) : max(1, x2)]
        if crop.size == 0:
            return np.zeros(EMB_DIM, dtype=np.float32)
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].reshape(-1)
        hue = hsv[:, :, 0].reshape(-1)
        marker = hue[sat > 120]
        if marker.size == 0:
            return np.zeros(EMB_DIM, dtype=np.float32)
        dom_hue = int(np.median(marker)) // 8  # quantise -> robust signature
        rng = np.random.default_rng(1000 + dom_hue)
        v = rng.standard_normal(EMB_DIM).astype(np.float32)
        return v / float(np.linalg.norm(v))
