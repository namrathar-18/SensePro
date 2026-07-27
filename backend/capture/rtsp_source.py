"""RTSP frame source: always the latest frame, never a growing queue.

A background thread drains the camera stream continuously (that is what keeps
"latest" actually fresh — an undrained VideoCapture buffers and lags) and
keeps only the newest frame. Consumers sample it at their own rate via
`latest()`; stale frames are simply overwritten, so classroom capture stays
near-real-time no matter how slow the pipeline runs.

Disconnect handling: a failed open or read releases the capture and reopens
with exponential backoff. State transitions (CONNECTING / CONNECTED /
RECONNECTING) are logged once per change, always with the password masked —
the raw URL never reaches a log line. Frames live in memory only.
"""

from __future__ import annotations

import logging
import re
import threading
import time

import cv2
import numpy as np

logger = logging.getLogger("sensepro.capture")

_CREDENTIALS = re.compile(r"(rtsp://[^:/@]+:)[^@]+@")


def mask_rtsp_url(url: str) -> str:
    """Replace the password in an rtsp://user:password@host URL with ****."""
    return _CREDENTIALS.sub(r"\1****@", url)


class RtspSource:
    """Threaded reader over cv2.VideoCapture with reconnect + backoff.

    `capture_factory` exists so tests can drive the reconnect logic with a
    fake capture — no camera, no network.
    """

    def __init__(
        self,
        url: str,
        capture_factory=cv2.VideoCapture,
        backoff_base_s: float = 1.0,
        backoff_cap_s: float = 30.0,
    ) -> None:
        self._url = url
        self._masked = mask_rtsp_url(url)
        self._capture_factory = capture_factory
        self._backoff_base = backoff_base_s
        self._backoff_cap = backoff_cap_s
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._frame: np.ndarray | None = None
        self._frame_ts: float = 0.0
        self._thread: threading.Thread | None = None
        self._state = "IDLE"

    @property
    def state(self) -> str:
        return self._state

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="rtsp-source", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)

    def latest(self) -> tuple[np.ndarray, float] | None:
        """Newest frame and its monotonic capture time, or None before first frame."""
        with self._lock:
            if self._frame is None:
                return None
            return self._frame, self._frame_ts

    def _set_state(self, state: str) -> None:
        if state != self._state:
            self._state = state
            logger.info("rtsp %s: %s", self._masked, state)

    def _run(self) -> None:
        cap = None
        delay = self._backoff_base
        connected_once = False
        while not self._stop.is_set():
            if cap is None:
                self._set_state("RECONNECTING" if connected_once else "CONNECTING")
                cap = self._capture_factory(self._url)
                if cap is None or not cap.isOpened():
                    if cap is not None:
                        cap.release()
                    cap = None
                    self._stop.wait(delay)
                    delay = min(delay * 2, self._backoff_cap)
                    continue
                self._set_state("CONNECTED")
                connected_once = True
                delay = self._backoff_base
            ok, frame = cap.read()
            if not ok or frame is None:
                cap.release()
                cap = None
                self._set_state("RECONNECTING")
                self._stop.wait(delay)
                delay = min(delay * 2, self._backoff_cap)
                continue
            with self._lock:
                self._frame = frame
                self._frame_ts = time.monotonic()
        if cap is not None:
            cap.release()
