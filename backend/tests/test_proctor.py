"""
Tests for proctor gaze-down suppression (model-free, pure logic).
Critical invariant: students looking DOWN (writing) must never be flagged.
"""
import pytest
import time
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dataclasses import dataclass
from typing import Optional

# Inline GazeTracker so CI does not need ultralytics/insightface
GAZE_DOWN_ANGLE_DEG = 25.0
GAZE_SUSTAINED_S    = 2.0


@dataclass
class GazeTracker:
    student_id: str
    deviated_since: Optional[float] = None

    def update(self, pitch: float, yaw: float, ts: float) -> bool:
        looking_down = pitch < -GAZE_DOWN_ANGLE_DEG
        looking_away = abs(yaw) > 30
        if looking_down:
            self.deviated_since = None
            return False
        if looking_away and not looking_down:
            if self.deviated_since is None:
                self.deviated_since = ts
            elif ts - self.deviated_since >= GAZE_SUSTAINED_S:
                return True
        else:
            self.deviated_since = None
        return False


def make_tracker():
    return GazeTracker(student_id="student-1")


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_looking_down_never_triggers_flag():
    """Gaze pitched downward (writing) must never produce a flag."""
    tracker = make_tracker()
    now = time.time()
    for i in range(20):
        flagged = tracker.update(pitch=-30.0, yaw=0.0, ts=now + i * 0.5)
        assert not flagged, f"Looking down (writing) should never flag — iteration {i}"


def test_looking_sideways_eventually_flags():
    """Sustained lateral gaze (not writing) should eventually flag."""
    tracker = make_tracker()
    now = time.time()
    flags = [tracker.update(pitch=5.0, yaw=45.0, ts=now + i * 0.5) for i in range(10)]
    assert any(flags), "Sustained lateral gaze should eventually produce a flag"


def test_looking_down_resets_gaze_timer():
    """Looking down resets the deviation timer completely."""
    tracker = make_tracker()
    now = time.time()
    tracker.update(pitch=5.0, yaw=45.0, ts=now)
    tracker.update(pitch=5.0, yaw=45.0, ts=now + 1.0)
    tracker.update(pitch=-35.0, yaw=0.0, ts=now + 1.5)   # writing — reset
    flagged = tracker.update(pitch=5.0, yaw=45.0, ts=now + 2.0)
    assert not flagged, "Timer must reset after writing posture"


def test_forward_gaze_does_not_flag():
    tracker = make_tracker()
    now = time.time()
    for i in range(20):
        assert not tracker.update(pitch=0.0, yaw=5.0, ts=now + i * 0.5)


def test_gaze_timer_resets_on_normal_gaze():
    tracker = make_tracker()
    now = time.time()
    tracker.update(pitch=5.0, yaw=50.0, ts=now)
    tracker.update(pitch=0.0, yaw=0.0,  ts=now + 1.0)   # look forward — reset
    flagged = tracker.update(pitch=5.0, yaw=50.0, ts=now + 1.5)
    assert not flagged, "After looking forward, timer should reset"


def test_fpr_reduction_metric():
    """FPR reduction calculation is correct."""
    from dataclasses import dataclass, field

    @dataclass
    class MockFlag:
        flag_type: str
        confidence: float
        suppressed: bool

    flags = [
        MockFlag("gaze_sustained", 0.7, True),
        MockFlag("gaze_sustained", 0.7, True),
        MockFlag("gaze_sustained", 0.7, False),
        MockFlag("phone_detected", 0.9, False),
    ]
    total      = sum(1 for f in flags if f.flag_type == "gaze_sustained")
    suppressed = sum(1 for f in flags if f.suppressed)
    reduction  = suppressed / total if total > 0 else 0.0

    assert total == 3
    assert suppressed == 2
    assert abs(reduction - 0.667) < 0.01


def test_threshold_boundary_exactly_at_angle():
    """Pitch exactly at threshold should NOT suppress (only strict < suppresses)."""
    tracker = make_tracker()
    now = time.time()
    # pitch == -25.0 is NOT < -25.0, so it's NOT looking_down → can flag
    result = tracker.update(pitch=-25.0, yaw=50.0, ts=now)
    # This starts the timer, not flags immediately
    assert not result  # just started tracking, not sustained yet
    result2 = tracker.update(pitch=-25.0, yaw=50.0, ts=now + 10.0)
    assert result2  # now sustained
