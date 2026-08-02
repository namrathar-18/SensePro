"""Presence write-path to Supabase (service role, RLS-bypassing).

The frontend reads Postgres directly via RLS + Realtime; the backend ONLY
writes inference results. This module is that write side and nothing else — it
never reads roster/attendance back, and it never persists a raw frame.

Design:
- `PresenceWriter` is a protocol. `NoopWriter` (default when Supabase is not
  configured) keeps the dev/stub/CI loop fully offline; `SupabaseWriter`
  talks to PostgREST with the server key over one shared HTTP client.
- Intervals get a client-generated id: opening an interval INSERTs the row,
  closing it PATCHes ended_at onto the same id — never a second insert.
- A failed presence write is logged and dropped; it must never crash or stall
  the capture loop. (A retry queue was considered and rejected: writes are
  sparse — one burst per re-ID pass — and a queue that only drains on the
  next write adds code without changing outcomes at this scale.)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

logger = logging.getLogger("sensepro.store")


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


@dataclass
class PresenceInterval:
    """One presence_intervals row; id is generated client-side so a close can
    address the exact row its open created."""

    session_id: str
    student_id: str
    state: str
    started_at: datetime
    ended_at: datetime | None = None
    id: str = field(default_factory=lambda: str(uuid4()))

    def open_payload(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "student_id": self.student_id,
            "state": self.state,
            "started_at": _iso(self.started_at),
        }


@dataclass
class ProctorFlagRow:
    """One proctor_flags row: a candidate event for HUMAN review (Phase 3).
    The DB status enum is pending/dismissed/upheld — 'pending' is what every
    UI renders as "awaiting review"; only a reviewer changes it. No verdict
    or score lives on this row."""

    session_id: str
    flag_type: str  # 'phone' | 'extra_person' | 'head_pose' | 'other' (DB CHECK)
    flagged_at: datetime
    student_id: str | None = None
    review_status: str = "pending"
    id: str = field(default_factory=lambda: str(uuid4()))

    def payload(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "student_id": self.student_id,
            "flag_type": self.flag_type,
            "flagged_at": _iso(self.flagged_at),
            "review_status": self.review_status,
        }


@dataclass
class ZoneAggregateRow:
    """One engagement_zone_aggregates row (Tier 2). Zone-level by design:
    there is NO student or track identifier on this row, and none may ever
    be added — that would break the k>=5 aggregate-only privacy tier."""

    session_id: str
    window_start: datetime
    window_s: int
    zone: str  # 'front' | 'mid' | 'back' | 'class' (DB CHECK)
    n_tracked: int  # DB CHECK n_tracked >= 5; suppressed in code before that
    enrolled_in_zone: int
    coverage: float  # 0..1: distinct tracks seen / enrolled in the zone
    vnei: float  # 0..1: visibility-normalised engagement index
    signals: dict = field(default_factory=dict)  # rates only, e.g. phone_rate
    id: str = field(default_factory=lambda: str(uuid4()))

    def payload(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "window_start": _iso(self.window_start),
            "window_s": self.window_s,
            "zone": self.zone,
            "n_tracked": self.n_tracked,
            "enrolled_in_zone": self.enrolled_in_zone,
            "coverage": self.coverage,
            "vnei": self.vnei,
            "signals": self.signals,
        }


class PresenceWriter(Protocol):
    def create_session(
        self, class_section: str, subject: str | None, mode: str
    ) -> tuple[str, datetime]: ...
    def end_session(self, session_id: str, ends_at: datetime) -> None: ...
    def open_interval(self, row: PresenceInterval) -> None: ...
    def close_interval(self, row: PresenceInterval) -> None: ...
    def create_flag(self, row: ProctorFlagRow) -> None: ...
    def create_zone_aggregate(self, row: ZoneAggregateRow) -> None: ...
    def set_manual_presence(
        self, session_id: str, reg_no: str, state: str, at: datetime
    ) -> None: ...
    def create_student(
        self, reg_no: str, full_name: str, class_section: str, seat_zone: str
    ) -> str: ...


class NoopWriter:
    """Offline default: records intent in logs, persists nothing."""

    def create_session(
        self, class_section: str, subject: str | None, mode: str
    ) -> tuple[str, datetime]:
        logger.info("noop create_session section=%s mode=%s", class_section, mode)
        return "noop-session", datetime.now(UTC)

    def end_session(self, session_id: str, ends_at: datetime) -> None:
        logger.info("noop end_session id=%s", session_id)

    def open_interval(self, row: PresenceInterval) -> None:
        logger.debug("noop open %s %s", row.student_id, row.state)

    def close_interval(self, row: PresenceInterval) -> None:
        logger.debug("noop close %s %s", row.student_id, row.state)

    def create_flag(self, row: ProctorFlagRow) -> None:
        logger.debug("noop flag %s %s", row.flag_type, row.student_id)

    def create_zone_aggregate(self, row: ZoneAggregateRow) -> None:
        logger.debug("noop zone aggregate %s vnei=%s", row.zone, row.vnei)

    def set_manual_presence(
        self, session_id: str, reg_no: str, state: str, at: datetime
    ) -> None:
        logger.info("noop manual presence %s %s -> %s", session_id, reg_no, state)

    def create_student(
        self, reg_no: str, full_name: str, class_section: str, seat_zone: str
    ) -> str:
        logger.info("noop create_student %s %s", reg_no, full_name)
        return "noop-student"


class SupabaseWriter:
    """PostgREST writer using the server (service-role) key.

    One shared httpx.Client for the writer's lifetime. Presence writes swallow
    and log their own errors — the capture loop must survive a DB outage.
    Session lifecycle calls raise instead, so the HTTP endpoint can return a
    clean 502: a session that never persisted has no id to attach presence to.
    """

    def __init__(self, url: str, key: str) -> None:
        import httpx  # lazy: the offline path never needs it

        self._client = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )

    def create_session(
        self, class_section: str, subject: str | None, mode: str
    ) -> tuple[str, datetime]:
        device_id = self._ensure_default_device()
        starts_at = datetime.now(UTC)
        r = self._client.post(
            "/class_sessions",
            headers={"Prefer": "return=representation"},
            json={
                "device_id": device_id,
                "class_section": class_section,
                "subject": subject,
                "mode": mode,
                "starts_at": _iso(starts_at),
            },
        )
        r.raise_for_status()
        return r.json()[0]["id"], starts_at

    def end_session(self, session_id: str, ends_at: datetime) -> None:
        # Ask for the updated rows back: PostgREST answers 200 even when the
        # filter matched nothing, so without this a wrong or already-deleted id
        # reported success and the UI said "Session ended" for a no-op.
        r = self._client.patch(
            "/class_sessions",
            params={"id": f"eq.{session_id}"},
            headers={"Prefer": "return=representation"},
            json={"ends_at": _iso(ends_at)},
        )
        r.raise_for_status()
        if not r.json():
            raise ValueError(f"no session with id {session_id}")

    def open_interval(self, row: PresenceInterval) -> None:
        try:
            r = self._client.post("/presence_intervals", json=row.open_payload())
            r.raise_for_status()
        except Exception as exc:  # noqa: BLE001 — never crash the capture loop
            logger.warning("presence open dropped: %s %s (%s)", row.student_id, row.state, exc)

    def close_interval(self, row: PresenceInterval) -> None:
        if row.ended_at is None:
            return
        try:
            r = self._client.patch(
                "/presence_intervals",
                params={"id": f"eq.{row.id}"},
                json={"ended_at": _iso(row.ended_at)},
            )
            r.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.warning("presence close dropped: %s %s (%s)", row.student_id, row.state, exc)

    def create_flag(self, row: ProctorFlagRow) -> None:
        """Proctor flags are assistive review items — like presence, a lost
        write is logged and dropped rather than stalling the capture loop."""
        try:
            r = self._client.post("/proctor_flags", json=row.payload())
            r.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.warning("proctor flag dropped: %s %s (%s)", row.flag_type, row.student_id, exc)

    def create_zone_aggregate(self, row: ZoneAggregateRow) -> None:
        """Zone aggregates are periodic and reproducible from a re-run — like
        the other inference writes, log-and-drop on failure."""
        try:
            r = self._client.post("/engagement_zone_aggregates", json=row.payload())
            r.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.warning("zone aggregate dropped: %s (%s)", row.zone, exc)

    def set_manual_presence(
        self, session_id: str, reg_no: str, state: str, at: datetime
    ) -> None:
        """Teacher override for edge cases: force a student's state. Closes any
        open interval for (session, student) then opens a fresh one in the given
        state — the same shape the capture recorder writes, so the roster derives
        it identically. Raises on failure so the endpoint can report it."""
        got = self._client.get(
            "/students",
            params={"reg_no": f"eq.{reg_no}", "select": "id,class_section", "limit": "1"},
        )
        got.raise_for_status()
        rows = got.json()
        if not rows:
            raise ValueError(f"no student with reg_no {reg_no}")
        student_id = rows[0]["id"]
        # The student must belong to the class this session was opened for —
        # otherwise anyone who scans the QR could mark themselves into another
        # cohort's attendance.
        sess = self._client.get(
            "/class_sessions",
            params={"id": f"eq.{session_id}", "select": "class_section", "limit": "1"},
        )
        sess.raise_for_status()
        sess_rows = sess.json()
        if sess_rows and sess_rows[0].get("class_section") != rows[0].get("class_section"):
            raise ValueError(f"{reg_no} is not in this session's class")
        # Close whatever is currently open for this student in this session.
        self._client.patch(
            "/presence_intervals",
            params={
                "session_id": f"eq.{session_id}",
                "student_id": f"eq.{student_id}",
                "ended_at": "is.null",
            },
            json={"ended_at": _iso(at)},
        ).raise_for_status()
        # Open the new, manually-set interval.
        self._client.post(
            "/presence_intervals",
            json=PresenceInterval(
                session_id=session_id, student_id=student_id, state=state, started_at=at
            ).open_payload(),
        ).raise_for_status()

    def create_student(
        self, reg_no: str, full_name: str, class_section: str, seat_zone: str
    ) -> str:
        """Create (or upsert on reg_no) a student roster record. This adds the
        identity row; the face embedding is a separate capture step (the enrol
        CLI). Returns the student id. Raises on failure."""
        r = self._client.post(
            "/students",
            headers={"Prefer": "return=representation,resolution=merge-duplicates"},
            json={
                "reg_no": reg_no,
                "full_name": full_name,
                "class_section": class_section,
                "seat_zone": seat_zone,
            },
        )
        r.raise_for_status()
        return r.json()[0]["id"]

    def _ensure_default_device(self) -> str:
        """class_sessions.device_id is NOT NULL but browser capture has no
        hardware row; reuse a single 'browser-capture' device."""
        got = self._client.get(
            "/devices",
            params={"device_key": "eq.browser-capture", "select": "id", "limit": "1"},
        )
        got.raise_for_status()
        rows = got.json()
        if rows:
            return rows[0]["id"]
        made = self._client.post(
            "/devices",
            headers={"Prefer": "return=representation"},
            json={"device_key": "browser-capture", "label": "Browser capture client"},
        )
        made.raise_for_status()
        return made.json()[0]["id"]


def build_writer() -> PresenceWriter:
    """Real writer when Supabase is configured, else the no-op. Callers hold
    the writer for their own lifetime (one per WS connection / HTTP request)."""
    from app.config import settings

    if settings.supabase_enabled:
        return SupabaseWriter(url=settings.supabase_url, key=settings.supabase_secret_key)
    logger.info("presence write-path: Supabase not configured, using no-op writer")
    return NoopWriter()


@dataclass
class SessionRecorder:
    """Bridges FSM transitions to presence_intervals rows: a state change
    closes the student's open interval (PATCH) and opens the new one (INSERT).
    Converts the FSM's relative seconds to absolute timestamps."""

    writer: PresenceWriter
    session_id: str
    session_start: datetime
    # reg_no -> students.id (UUID). The pipeline identifies students by register
    # number (the enrolment key), but presence_intervals.student_id is the UUID
    # FK; without this map the DB rejects every write. Empty = write ids as-is
    # (the offline/stub loop, where nothing actually persists).
    student_id_map: dict[str, str] = field(default_factory=dict)
    _open: dict[str, PresenceInterval] = field(default_factory=dict)

    def _abs(self, rel_ts: float) -> datetime:
        return self.session_start + timedelta(seconds=rel_ts)

    def record(self, transitions: list[tuple[str, str]], rel_ts: float) -> None:
        at = self._abs(rel_ts)
        for student_id, state in transitions:
            # Skip students we can't resolve to a DB row when a map is present,
            # so a stray id never triggers a rejected write.
            db_id = self.student_id_map.get(student_id) if self.student_id_map else student_id
            if db_id is None:
                continue
            prev = self._open.pop(student_id, None)
            if prev is not None:
                prev.ended_at = at
                self.writer.close_interval(prev)
            new = PresenceInterval(
                session_id=self.session_id, student_id=db_id, state=state, started_at=at
            )
            self._open[student_id] = new
            self.writer.open_interval(new)

    def close(self, rel_ts: float) -> None:
        at = self._abs(rel_ts)
        for row in self._open.values():
            row.ended_at = at
            self.writer.close_interval(row)
        self._open.clear()
