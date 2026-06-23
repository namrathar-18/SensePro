"""
Tests for VNEI engagement aggregation.
Key invariants tested:
  - k-suppression (< 5 students → vnei_score = None)
  - VNEI < naive mean for back zones (coverage correction)
  - No per-student data in output
  - Zone assignment logic
"""
import pytest
import time
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.vnei import (
    VNEIAggregator, EngagementSignal, assign_zone,
    head_pose_to_score, ZoneWindow,
)


def make_signal(student_id: str, zone: str, **kwargs) -> EngagementSignal:
    return EngagementSignal(
        student_id=student_id, zone=zone,
        head_pose_score=kwargs.get('pose', 0.8),
        eye_closure_score=kwargs.get('eye', 1.0),
        phone_score=kwargs.get('phone', 1.0),
        stillness_score=kwargs.get('still', 1.0),
    )


# ─── k-suppression ───────────────────────────────────────────────────────────

def test_k_suppression_below_threshold():
    """Zones with < 5 students must have vnei_score = None."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())

    # Add only 3 students to 'back' zone
    for i in range(3):
        agg.add_signal(make_signal(f"s{i}", "back"))

    results = agg.compute(time.time())
    back = next(r for r in results if r['zone'] == 'back')
    assert back['vnei_score'] is None, "k-suppression must apply when count < 5"
    assert back['student_count'] == 3


def test_k_suppression_at_threshold():
    """Exactly 5 students → score should be computed (not None)."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())
    for i in range(5):
        agg.add_signal(make_signal(f"s{i}", "front"))
    results = agg.compute(time.time())
    front = next(r for r in results if r['zone'] == 'front')
    assert front['vnei_score'] is not None


def test_k_suppression_above_threshold():
    """More than 5 students → score computed."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())
    for i in range(8):
        agg.add_signal(make_signal(f"s{i}", "middle"))
    results = agg.compute(time.time())
    mid = next(r for r in results if r['zone'] == 'middle')
    assert mid['vnei_score'] is not None
    assert mid['student_count'] == 8


# ─── Coverage correction ─────────────────────────────────────────────────────

def test_back_zone_lower_coverage_than_front():
    """Back zone coverage ratio must be lower than front zone."""
    front_w = ZoneWindow(zone='front')
    back_w  = ZoneWindow(zone='back')
    assert back_w.coverage_ratio < front_w.coverage_ratio


def test_vnei_score_bounded_0_to_1():
    """VNEI scores must stay in [0, 1]."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())
    for i in range(6):
        agg.add_signal(make_signal(f"s{i}", "front", pose=1.0, eye=1.0, phone=1.0, still=1.0))
    results = agg.compute(time.time())
    for r in results:
        if r['vnei_score'] is not None:
            assert 0.0 <= r['vnei_score'] <= 1.0


def test_phone_detection_reduces_score():
    """A zone where everyone has a phone should score lower."""
    agg1 = VNEIAggregator()
    agg1.reset_window(time.time())
    for i in range(5):
        agg1.add_signal(make_signal(f"s{i}", "front", phone=1.0))  # no phones
    results1 = agg1.compute(time.time())

    agg2 = VNEIAggregator()
    agg2.reset_window(time.time())
    for i in range(5):
        agg2.add_signal(make_signal(f"s{i}", "front", phone=0.0))  # all have phones
    results2 = agg2.compute(time.time())

    score1 = next(r['vnei_score'] for r in results1 if r['zone'] == 'front')
    score2 = next(r['vnei_score'] for r in results2 if r['zone'] == 'front')
    assert score1 > score2, "Phone detection should reduce engagement score"


def test_no_per_student_data_in_output():
    """Output dicts must not contain student_id fields."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())
    for i in range(6):
        agg.add_signal(make_signal(f"student-{i}", "middle"))
    results = agg.compute(time.time())
    for r in results:
        assert 'student_id' not in r, "Per-student data must not appear in VNEI output"


def test_naive_vs_vnei_weighted():
    """VNEI weighted mean should differ from naive mean when coverage varies."""
    agg = VNEIAggregator()
    agg.reset_window(time.time())
    for i in range(6):
        agg.add_signal(make_signal(f"sf{i}", "front"))
    for i in range(6):
        agg.add_signal(make_signal(f"sb{i}", "back"))
    results = agg.compute(time.time())

    naive   = VNEIAggregator.compute_naive_mean(results)
    weighted = VNEIAggregator.compute_vnei_weighted(results)
    # They should differ because front (95%) vs back (45%) coverage
    assert naive != weighted


def test_reset_clears_window():
    agg = VNEIAggregator()
    t0 = time.time()
    agg.reset_window(t0)
    for i in range(5):
        agg.add_signal(make_signal(f"s{i}", "front"))
    assert len(agg._windows) > 0
    agg.reset_window(time.time())
    assert len(agg._windows) == 0


# ─── Head pose scoring ────────────────────────────────────────────────────────

def test_head_pose_forward_is_max():
    score = head_pose_to_score(yaw=0.0, pitch=0.0)
    assert score == 1.0


def test_head_pose_fully_away_is_min():
    score = head_pose_to_score(yaw=90.0, pitch=90.0)
    assert score == 0.0


def test_head_pose_partial():
    score = head_pose_to_score(yaw=45.0, pitch=0.0)
    assert 0.0 < score < 1.0


# ─── Zone assignment ─────────────────────────────────────────────────────────

def test_zone_top_of_frame_is_back():
    # Face near top of frame = far from camera = back of room
    zone = assign_zone((100, 10, 200, 60), frame_width=640, frame_height=480)
    assert zone == 'back'


def test_zone_bottom_of_frame_is_front():
    # Face near bottom = close to camera = front row
    zone = assign_zone((100, 380, 200, 470), frame_width=640, frame_height=480)
    assert zone == 'front'


def test_zone_middle_of_frame():
    zone = assign_zone((100, 200, 200, 280), frame_width=640, frame_height=480)
    assert zone == 'middle'
