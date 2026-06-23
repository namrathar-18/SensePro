"""
SensePro+ — Visibility-Normalised Engagement Index (VNEI)

WHAT IT IS:
  VNEI is a per-zone engagement aggregate that corrects for camera visibility bias.
  Students in the front are more visible → naive averages over-count them.
  VNEI weights each zone by its estimated coverage ratio (fraction of seats visible).

WHAT IT IS NOT:
  - Not a per-student score (those do not exist in this system)
  - Not an emotion label
  - Not a disciplinary metric

BEHAVIOURAL SIGNALS (observable, not inferred emotional states):
  - head_pose_score:  1 - (|yaw|/90 + |pitch|/90) / 2  → 0 = looking away, 1 = forward
  - eye_closure_score: 1 if EAR > 0.2 else 0           → 0 = eyes closed
  - phone_score:      0 if phone detected else 1
  - stillness_score:  derived from inter-frame motion of face bbox centroid

VNEI formula:
  raw_engagement = (w_pose * head_pose + w_eye * eye + w_phone * phone + w_still * stillness)
  vnei = raw_engagement * coverage_ratio   (0→1, higher = more engaged + more visible)

K-SUPPRESSION:
  If student_count < 5 in a zone, vnei_score is set to NULL and not shown.
  This is enforced both here and by the DB CHECK constraint.
"""
import math
import logging
from dataclasses import dataclass, field
from typing import Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Signal weights (must sum to 1.0)
W_POSE   = 0.35
W_EYE    = 0.25
W_PHONE  = 0.25
W_STILL  = 0.15


@dataclass
class EngagementSignal:
    """Per-detection engagement signals from one student in one frame."""
    student_id: str
    zone: str
    head_pose_score: float = 0.5     # 0–1
    eye_closure_score: float = 1.0   # 1 = open
    phone_score: float = 1.0         # 1 = no phone
    stillness_score: float = 1.0     # 1 = still (not frantically moving)


@dataclass
class ZoneWindow:
    """Accumulator for one zone over one time window."""
    zone: str
    signals: list[EngagementSignal] = field(default_factory=list)
    coverage_ratio: float = 1.0      # Set based on zone (back < front)

    # Default coverage by zone (camera typically at front)
    ZONE_COVERAGE = {
        "front":  0.95,
        "middle": 0.75,
        "back":   0.45,
        "left":   0.70,
        "right":  0.70,
    }

    def __post_init__(self):
        self.coverage_ratio = self.ZONE_COVERAGE.get(self.zone, 0.70)


class VNEIAggregator:
    """
    Accumulates engagement signals over a rolling window and computes VNEI.
    One instance per active session.
    """

    def __init__(self):
        # {zone: ZoneWindow}
        self._windows: dict[str, ZoneWindow] = {}
        self._window_start: float = 0.0

    def reset_window(self, ts: float):
        self._windows = {}
        self._window_start = ts

    def add_signal(self, signal: EngagementSignal):
        if signal.zone not in self._windows:
            self._windows[signal.zone] = ZoneWindow(zone=signal.zone)
        self._windows[signal.zone].signals.append(signal)

    def compute(self, window_end: float) -> list[dict]:
        """
        Compute VNEI for all zones in the current window.
        Returns list of dicts suitable for inserting into engagement_zone_aggregates.
        Applies k-suppression: zones with < VNEI_MIN_STUDENTS get vnei_score=None.
        """
        results = []

        for zone, zw in self._windows.items():
            # Deduplicate by student (take mean per student)
            per_student: dict[str, list[EngagementSignal]] = {}
            for sig in zw.signals:
                per_student.setdefault(sig.student_id, []).append(sig)

            student_count = len(per_student)

            # Compute per-student mean, then zone mean
            pose_vals, eye_vals, phone_vals, still_vals = [], [], [], []
            for sigs in per_student.values():
                pose_vals.append(sum(s.head_pose_score for s in sigs) / len(sigs))
                eye_vals.append(sum(s.eye_closure_score for s in sigs) / len(sigs))
                phone_vals.append(sum(s.phone_score for s in sigs) / len(sigs))
                still_vals.append(sum(s.stillness_score for s in sigs) / len(sigs))

            head_pose_avg = _mean(pose_vals)
            eye_closure_avg = _mean(eye_vals)
            phone_rate = 1.0 - _mean(phone_vals)  # fraction with phone detected
            stillness_avg = _mean(still_vals)

            raw_engagement = (
                W_POSE  * head_pose_avg +
                W_EYE   * eye_closure_avg +
                W_PHONE * _mean(phone_vals) +
                W_STILL * stillness_avg
            )
            coverage = zw.coverage_ratio

            # K-suppression
            vnei_score = None
            if student_count >= settings.VNEI_MIN_STUDENTS:
                vnei_score = round(raw_engagement * coverage, 4)

            results.append({
                "zone":            zone,
                "window_start":    self._window_start,
                "window_end":      window_end,
                "student_count":   student_count,
                "vnei_score":      vnei_score,
                "coverage_ratio":  round(coverage, 3),
                "head_pose_avg":   round(head_pose_avg, 4),
                "eye_closure_avg": round(eye_closure_avg, 4),
                "phone_rate":      round(phone_rate, 4),
                "stillness_avg":   round(stillness_avg, 4),
            })

        return results

    @staticmethod
    def compute_naive_mean(zone_results: list[dict]) -> float:
        """
        Naive unweighted mean across zones (for bias comparison chart).
        Shows how VNEI differs from ignoring coverage.
        """
        scores = [z["vnei_score"] for z in zone_results if z["vnei_score"] is not None]
        if not scores:
            return 0.0
        return round(sum(scores) / len(scores), 4)

    @staticmethod
    def compute_vnei_weighted(zone_results: list[dict]) -> float:
        """
        Coverage-weighted mean across zones (the actual VNEI class score).
        """
        weighted_sum = 0.0
        total_weight = 0.0
        for z in zone_results:
            if z["vnei_score"] is not None:
                w = z["coverage_ratio"]
                weighted_sum += z["vnei_score"] * w
                total_weight += w
        if total_weight == 0:
            return 0.0
        return round(weighted_sum / total_weight, 4)


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def head_pose_to_score(yaw: float, pitch: float) -> float:
    """
    Convert head pose angles to a 0–1 engagement score.
    0 = looking fully away, 1 = looking straight at board.
    """
    yaw_norm   = min(abs(yaw)   / 90.0, 1.0)
    pitch_norm = min(abs(pitch) / 90.0, 1.0)
    return round(1.0 - (yaw_norm + pitch_norm) / 2, 4)


def assign_zone(bbox: tuple, frame_width: int, frame_height: int) -> str:
    """
    Assign a spatial zone to a detected face based on its bbox position.
    Zone model: front/middle/back by vertical position (y-axis in classroom perspective).
    """
    x1, y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2

    # Vertical zone (assuming camera at front, students fill frame top→back)
    y_ratio = cy / frame_height
    if y_ratio < 0.33:
        vertical = "back"       # top of frame = far from camera = back of room
    elif y_ratio < 0.66:
        vertical = "middle"
    else:
        vertical = "front"      # bottom of frame = close to camera = front row

    return vertical
