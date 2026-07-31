"""Gaze-down suppression: the proctor false-positive killer.

A student looking down at the desk (writing posture) is the single biggest
source of bogus phone flags — hands near the lap, head tilted, exactly the
geometry of phone use. So: whenever a track is observed pitched down past a
threshold, phone-adjacent flags for that track are suppressed for a short
window. The point (and the Phase-3 eval metric) is the false-positive rate
with this filter on vs off.

Head pitch is a deliberately simple, documented heuristic — not a gaze model:
the detector's own eye landmarks sit ~40% down the face box when the head is
level, and slide lower as the head pitches down. That monotonic relationship
is all a suppression gate needs. Tests can bypass estimation entirely and
feed pitch values straight to the suppressor.
"""

from __future__ import annotations

from vision.types import Detection

# Eye line at 40% of box height reads as level; each 1% lower adds ~2 degrees
# of downward pitch (negative). Calibrated for a gate, not for measurement.
_LEVEL_EYE_RATIO = 0.40
_DEG_PER_RATIO = 200.0


def estimate_pitch_deg(det: Detection) -> float | None:
    """Head pitch in degrees (negative = down) from the detection's landmarks
    (InsightFace kps order: left eye, right eye, nose, mouth corners).
    None when the backend provides no landmarks (e.g. the stub)."""
    if len(det.landmarks) < 2:
        return None
    height = det.face_px_height
    if height <= 0:
        return None
    eye_y = (det.landmarks[0][1] + det.landmarks[1][1]) / 2.0
    eye_ratio = (eye_y - det.y1) / height
    return -(eye_ratio - _LEVEL_EYE_RATIO) * _DEG_PER_RATIO


def estimate_yaw_ratio(det: Detection) -> float | None:
    """Horizontal head-turn proxy: 0 = facing the camera, larger = turned away.
    From the InsightFace kps, the nose's horizontal offset from the eye midpoint,
    normalised by the inter-eye distance (so it's scale-free). None without
    landmarks (the stub)."""
    if len(det.landmarks) < 3:
        return None
    lx = det.landmarks[0][0]
    rx = det.landmarks[1][0]
    nx = det.landmarks[2][0]
    eye_dist = abs(rx - lx)
    if eye_dist <= 1:
        return None
    return abs(nx - (lx + rx) / 2.0) / eye_dist


class GazeSuppressor:
    """Remembers, per track, when it last looked down; answers whether a
    phone flag at time ts should be suppressed. Times are the pipeline's
    relative-seconds clock."""

    def __init__(self, window_s: float = 10.0, pitch_down_deg: float = -25.0) -> None:
        self._window = window_s
        self._threshold = pitch_down_deg
        self._last_down: dict[int, float] = {}

    def note_pitch(self, track_id: int, pitch_deg: float, ts: float) -> None:
        if pitch_deg <= self._threshold:
            self._last_down[track_id] = ts

    def suppressed(self, track_id: int, ts: float) -> bool:
        last = self._last_down.get(track_id)
        return last is not None and (ts - last) <= self._window
