"""Vision backend interfaces (dependency inversion).

Two implementations exist:
  - stub      : deterministic, dependency-free (dev/CI/tests, runs anywhere)
  - insightface: real SCRFD + ArcFace (production, on the inference machine)
Select with env VISION_BACKEND. The rest of the system depends only on these
protocols, never on a concrete backend.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from vision.types import Detection


class Detector(Protocol):
    def detect(self, frame_bgr: np.ndarray) -> list[Detection]: ...


class Embedder(Protocol):
    def embed(self, frame_bgr: np.ndarray, det: Detection) -> np.ndarray:
        """Return an L2-normalised embedding (e.g. 512-d) for the detected face."""
        ...


class Matcher(Protocol):
    def match(self, vec: np.ndarray) -> tuple[str | None, float]:
        """Nearest enrolled student id + cosine score, or (None, score)."""
        ...
