"""
Tests for the Presence FSM — the most critical logic in the system.
Run: pytest tests/test_presence_fsm.py -v
"""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.presence_fsm import PresenceFSM, PresenceState


# ─── Fixtures ────────────────────────────────────────────────────────────────

def make_fsm(student_ids=None):
    """Create an FSM with mocked DB callbacks."""
    open_cb  = AsyncMock(return_value="interval-uuid-123")
    close_cb = AsyncMock()
    fsm = PresenceFSM(
        session_id="session-1",
        student_ids=student_ids or ["student-1", "student-2"],
        on_interval_open=open_cb,
        on_interval_close=close_cb,
    )
    return fsm, open_cb, close_cb


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_initial_state_is_absent():
    fsm, _, _ = make_fsm()
    snapshot = fsm.get_snapshot()
    for entry in snapshot:
        assert entry["state"] == PresenceState.ABSENT.value


@pytest.mark.asyncio
async def test_detection_transitions_absent_to_present():
    fsm, open_cb, _ = make_fsm()
    await fsm.on_detection("student-1")
    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.PRESENT.value
    open_cb.assert_called_once()


@pytest.mark.asyncio
async def test_unknown_student_does_not_crash():
    fsm, open_cb, _ = make_fsm()
    await fsm.on_detection("ghost-student-999")  # not enrolled
    open_cb.assert_not_called()


@pytest.mark.asyncio
async def test_present_to_unverified_on_grace_timeout(monkeypatch):
    """After GRACE_PERIOD_S without detection, state → UNVERIFIED."""
    import app.services.presence_fsm as fsm_module
    # Patch settings to use tiny timeouts
    monkeypatch.setattr(fsm_module.settings, 'GRACE_PERIOD_S', 1)
    monkeypatch.setattr(fsm_module.settings, 'MISS_PERIOD_S', 10)

    fsm, open_cb, close_cb = make_fsm()
    await fsm.on_detection("student-1")

    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.PRESENT.value

    # Wait past grace period
    await asyncio.sleep(1.5)
    await fsm.tick()

    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.UNVERIFIED.value
    # Interval should have been closed (PRESENT ended) and new one opened (UNVERIFIED)
    assert close_cb.call_count >= 1


@pytest.mark.asyncio
async def test_unverified_to_absent_on_miss_timeout(monkeypatch):
    """After MISS_PERIOD_S without detection, UNVERIFIED → ABSENT."""
    import app.services.presence_fsm as fsm_module
    monkeypatch.setattr(fsm_module.settings, 'GRACE_PERIOD_S', 0)
    monkeypatch.setattr(fsm_module.settings, 'MISS_PERIOD_S', 1)

    fsm, _, _ = make_fsm()
    await fsm.on_detection("student-1")
    await fsm.tick()  # PRESENT → UNVERIFIED (grace=0)
    await asyncio.sleep(1.5)
    await fsm.tick()  # UNVERIFIED → ABSENT

    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.ABSENT.value


@pytest.mark.asyncio
async def test_re_detection_from_unverified_goes_to_present(monkeypatch):
    """Student detected again after being UNVERIFIED should go back to PRESENT."""
    import app.services.presence_fsm as fsm_module
    monkeypatch.setattr(fsm_module.settings, 'GRACE_PERIOD_S', 0)
    monkeypatch.setattr(fsm_module.settings, 'MISS_PERIOD_S', 100)

    fsm, open_cb, _ = make_fsm()
    await fsm.on_detection("student-1")  # → PRESENT
    await fsm.tick()                      # → UNVERIFIED

    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.UNVERIFIED.value

    await fsm.on_detection("student-1")  # → PRESENT again
    snap = {e["student_id"]: e for e in fsm.get_snapshot()}
    assert snap["student-1"]["state"] == PresenceState.PRESENT.value


@pytest.mark.asyncio
async def test_summary_counts_correctly():
    fsm, _, _ = make_fsm(["s1", "s2", "s3"])
    await fsm.on_detection("s1")
    await fsm.on_detection("s2")
    summary = fsm.summary()
    assert summary["PRESENT"] == 2
    assert summary["ABSENT"] == 1
    assert summary["UNVERIFIED"] == 0


@pytest.mark.asyncio
async def test_close_all_closes_open_intervals():
    fsm, _, close_cb = make_fsm()
    await fsm.on_detection("student-1")  # opens interval
    await fsm.close_all()
    close_cb.assert_called_once()


@pytest.mark.asyncio
async def test_multiple_detections_dont_reopen_interval():
    """Repeated detections of same PRESENT student should not open new intervals."""
    fsm, open_cb, _ = make_fsm()
    await fsm.on_detection("student-1")
    await fsm.on_detection("student-1")
    await fsm.on_detection("student-1")
    # Should only have opened one interval
    assert open_cb.call_count == 1
