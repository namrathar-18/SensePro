"""
SensePro+ — Presence State Machine

States: PRESENT → UNVERIFIED → ABSENT
              ↑___________________|  (re-verified)

PRESENT:     student identity confirmed within GRACE_PERIOD_S
UNVERIFIED:  not seen for > GRACE_PERIOD_S, may still be present but obscured
ABSENT:      not seen for > MISS_PERIOD_S, definitively absent

All state transitions are persisted to presence_intervals in Supabase.
"""
import time
import asyncio
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PresenceState(str, Enum):
    PRESENT    = "PRESENT"
    UNVERIFIED = "UNVERIFIED"
    ABSENT     = "ABSENT"


@dataclass
class StudentPresence:
    student_id: str
    state: PresenceState = PresenceState.ABSENT
    last_seen: float = 0.0           # timestamp of last confirmed detection
    state_entered: float = field(default_factory=time.time)
    interval_id: Optional[str] = None  # current open presence_interval UUID


class PresenceFSM:
    """
    Manages presence state for all students in a session.
    Call `on_detection(student_id)` whenever the vision pipeline confirms a student.
    Call `tick()` periodically (every ~5s) to handle timeouts.
    """

    def __init__(
        self,
        session_id: str,
        student_ids: list[str],
        on_interval_open: Callable[[str, str, str, float], Awaitable[str]],
        on_interval_close: Callable[[str, float], Awaitable[None]],
    ):
        """
        session_id: UUID of the active class_session
        student_ids: list of enrolled student UUIDs for this class
        on_interval_open(session_id, student_id, state, ts) -> interval_id (UUID)
        on_interval_close(interval_id, ts) -> None
        """
        self.session_id = session_id
        self.on_interval_open = on_interval_open
        self.on_interval_close = on_interval_close

        self._students: dict[str, StudentPresence] = {
            sid: StudentPresence(student_id=sid) for sid in student_ids
        }

    # ─── Public API ────────────────────────────────────────────────────────

    async def on_detection(self, student_id: str):
        """Called when vision pipeline confirms a student identity."""
        sp = self._students.get(student_id)
        if sp is None:
            logger.warning(f"Unknown student detected: {student_id}")
            return

        now = time.time()
        sp.last_seen = now

        prev_state = sp.state
        if prev_state in (PresenceState.ABSENT, PresenceState.UNVERIFIED):
            await self._transition(sp, PresenceState.PRESENT, now)
            logger.debug(f"{student_id}: {prev_state} → PRESENT")

    async def tick(self):
        """
        Called periodically to handle grace/miss timeouts.
        Should be called every ~5 seconds.
        """
        now = time.time()
        for sp in self._students.values():
            elapsed = now - sp.last_seen

            if sp.state == PresenceState.PRESENT:
                if elapsed > settings.GRACE_PERIOD_S:
                    await self._transition(sp, PresenceState.UNVERIFIED, now)
                    logger.debug(f"{sp.student_id}: PRESENT → UNVERIFIED (elapsed={elapsed:.0f}s)")

            elif sp.state == PresenceState.UNVERIFIED:
                if elapsed > settings.MISS_PERIOD_S:
                    await self._transition(sp, PresenceState.ABSENT, now)
                    logger.debug(f"{sp.student_id}: UNVERIFIED → ABSENT (elapsed={elapsed:.0f}s)")

    async def close_all(self):
        """Close all open intervals at session end."""
        now = time.time()
        for sp in self._students.values():
            if sp.interval_id:
                await self.on_interval_close(sp.interval_id, now)
                sp.interval_id = None

    def get_snapshot(self) -> list[dict]:
        """Current state of all students (for dashboard push)."""
        return [
            {
                "student_id": sp.student_id,
                "state": sp.state.value,
                "last_seen": sp.last_seen,
                "state_entered": sp.state_entered,
            }
            for sp in self._students.values()
        ]

    def summary(self) -> dict:
        """Aggregate counts for the session."""
        counts = {s: 0 for s in PresenceState}
        for sp in self._students.values():
            counts[sp.state] += 1
        return {s.value: c for s, c in counts.items()}

    # ─── Internal ──────────────────────────────────────────────────────────

    async def _transition(self, sp: StudentPresence, new_state: PresenceState, ts: float):
        """Close current interval, open a new one, update in-memory state."""
        if sp.interval_id:
            await self.on_interval_close(sp.interval_id, ts)
            sp.interval_id = None

        sp.state = new_state
        sp.state_entered = ts

        # Only persist PRESENT and UNVERIFIED intervals (not ABSENT — absence is inferred)
        if new_state in (PresenceState.PRESENT, PresenceState.UNVERIFIED):
            sp.interval_id = await self.on_interval_open(
                self.session_id, sp.student_id, new_state.value, ts
            )
