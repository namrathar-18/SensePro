"""Session lifecycle endpoints (write-path only), per the frozen openapi.yaml.

POST /v1/sessions          -> create a class session, return it
POST /v1/sessions/{id}/end -> mark it ended

These are the only REST routes the backend implements; everything else the UI
needs it reads directly from Postgres via RLS/Realtime. Writes go through the
same PresenceWriter (service role) used by the capture loop.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.store import build_writer

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])

# Per-process secret for the rotating check-in token. It never leaves the server,
# so a client cannot forge a valid future token — the anti-cheat property. (A
# server restart rotates the secret, invalidating any in-flight QR; fine, since a
# restart ends the session anyway. Multi-instance deploys would set this from a
# shared env value instead.)
_CHECKIN_SECRET = secrets.token_bytes(32)


def _checkin_window() -> int:
    return int(time.time() // settings.checkin_token_window_s)


def _checkin_token(session_id: str, window: int) -> str:
    msg = f"{session_id}:{window}".encode()
    return hmac.new(_CHECKIN_SECRET, msg, hashlib.sha256).hexdigest()[:16]


class SessionCreate(BaseModel):
    class_section: str
    subject: str | None = None
    mode: str = "lecture"


class SessionOut(BaseModel):
    id: str
    class_section: str
    subject: str | None = None
    mode: str
    starts_at: str
    ends_at: str | None = None


class PresenceOverride(BaseModel):
    reg_no: str
    state: str  # PRESENT | UNVERIFIED | ABSENT


class CheckinBody(BaseModel):
    reg_no: str
    token: str


_VALID_STATES = {"PRESENT", "UNVERIFIED", "ABSENT"}


@router.get("/{session_id}/checkin-token", response_model=dict)
def checkin_token(session_id: str) -> dict:
    """The current rotating QR token for a session. The teacher screen polls this
    and re-renders the QR each window."""
    return {
        "token": _checkin_token(session_id, _checkin_window()),
        "window_s": settings.checkin_token_window_s,
    }


@router.post("/{session_id}/checkin", response_model=dict)
def checkin(session_id: str, body: CheckinBody) -> dict:
    """Student self check-in via the rotating QR. Accepts the token only if it is
    the current or immediately-previous window's value — a forwarded / stale QR
    is rejected. On success the student is marked PRESENT."""
    w = _checkin_window()
    valid = {_checkin_token(session_id, w), _checkin_token(session_id, w - 1)}
    if body.token not in valid:
        raise HTTPException(status_code=403, detail="QR expired — scan the current code on screen")
    writer = build_writer()
    try:
        writer.set_manual_presence(session_id, body.reg_no.strip(), "PRESENT", datetime.now(UTC))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"check-in failed: {exc}") from exc
    return {"ok": True, "reg_no": body.reg_no.strip()}


@router.post("", status_code=201, response_model=SessionOut)
def create_session(body: SessionCreate) -> SessionOut:
    writer = build_writer()
    try:
        session_id, starts_at = writer.create_session(body.class_section, body.subject, body.mode)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"session persistence failed: {exc}") from exc
    return SessionOut(
        id=session_id,
        class_section=body.class_section,
        subject=body.subject,
        mode=body.mode,
        starts_at=starts_at.isoformat(),
    )


@router.post("/{session_id}/presence", response_model=dict)
def override_presence(session_id: str, body: PresenceOverride) -> dict:
    """Manual teacher override of a student's attendance state (edge cases:
    a mis-recognition, a student the camera never caught, etc.). Writes a
    presence interval in the chosen state via the service-role writer."""
    if body.state not in _VALID_STATES:
        raise HTTPException(status_code=400, detail=f"state must be one of {_VALID_STATES}")
    writer = build_writer()
    try:
        writer.set_manual_presence(session_id, body.reg_no, body.state, datetime.now(UTC))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"presence override failed: {exc}") from exc
    return {"ok": True, "reg_no": body.reg_no, "state": body.state}


@router.post("/{session_id}/end", response_model=dict)
def end_session(session_id: str) -> dict:
    writer = build_writer()
    try:
        writer.end_session(session_id, datetime.now(UTC))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"session end failed: {exc}") from exc
    return {"id": session_id, "ended": True}
