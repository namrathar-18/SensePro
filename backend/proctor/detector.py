"""Object detection for exam-mode proctoring, behind the same kind of
abstraction as the vision backends: a protocol, a deterministic stub for
dev/CI, and the real pretrained model behind a lazy import. No training —
YOLOv8n ships with COCO weights and we only read two of its classes.

Stub convention (mirrors vision/stub.py's colour markers): a saturated BLUE
block is a "cell phone", a saturated GREEN block is a "person". The vision
stub treats any saturated block as a face, so proctor tests hand the engine
their tracks explicitly rather than routing markers through both stubs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

# COCO class names, hue centres for the stub markers (OpenCV hue is 0-179:
# blue = 120, green = 60; the vision stub's red face marker = 0 matches neither).
_STUB_MARKERS = (("cell phone", 120), ("person", 60))


@dataclass(frozen=True)
class ObjectDetection:
    label: str  # COCO name: "cell phone" | "person"
    box: tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float


class ObjectDetector(Protocol):
    def detect(self, frame_bgr: np.ndarray) -> list[ObjectDetection]: ...


class StubProctorDetector:
    """Deterministic, dependency-free: colour markers stand in for objects."""

    def __init__(self, min_area: int = 400, hue_tol: int = 15) -> None:
        self.min_area = min_area
        self.hue_tol = hue_tol

    def detect(self, frame_bgr: np.ndarray) -> list[ObjectDetection]:
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        hue = hsv[:, :, 0].astype(int)
        saturated = hsv[:, :, 1] > 120
        out: list[ObjectDetection] = []
        for label, centre in _STUB_MARKERS:
            mask = ((np.abs(hue - centre) <= self.hue_tol) & saturated).astype(np.uint8)
            contours, _ = cv2.findContours(mask * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                if cv2.contourArea(c) < self.min_area:
                    continue
                x, y, w, h = cv2.boundingRect(c)
                out.append(ObjectDetection(label, (x, y, x + w, y + h), 0.9))
        return out


class YoloProctorDetector:
    """Pretrained YOLOv8n (COCO) filtered to the two labels proctoring needs.
    Lazy import keeps ultralytics optional: pip install -e '.[proctor]'."""

    LABELS = frozenset({"cell phone", "person"})

    def __init__(self, model_path: str = "yolov8n.pt", conf: float = 0.35) -> None:
        from ultralytics import YOLO  # lazy: CI and the stub path never need it

        self._model = YOLO(model_path)
        self._conf = conf

    def detect(self, frame_bgr: np.ndarray) -> list[ObjectDetection]:
        result = self._model.predict(frame_bgr, verbose=False, conf=self._conf)[0]
        out: list[ObjectDetection] = []
        for b in result.boxes:
            label = result.names[int(b.cls)]
            if label not in self.LABELS:
                continue
            x1, y1, x2, y2 = (int(v) for v in b.xyxy[0])
            out.append(ObjectDetection(label, (x1, y1, x2, y2), float(b.conf)))
        return out


def build_proctor_detector() -> ObjectDetector:
    """Factory selected by PROCTOR_BACKEND (stub | yolo); concrete classes are
    never imported outside this module."""
    from app.config import settings

    if settings.proctor_backend.lower() == "yolo":
        return YoloProctorDetector(conf=settings.proctor_conf)
    return StubProctorDetector()
