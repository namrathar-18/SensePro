"""Session lifecycle endpoints (write-path only), per the frozen openapi.yaml.

POST /v1/sessions          -> create a class session, return it
POST /v1/sessions/{id}/end -> mark it ended

These are the only REST routes the backend implements; everything else the UI
needs it reads directly from Postgres via RLS/Realtime. Writes go through the
same PresenceWriter (service role) used by the capture loop.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.store import build_writer

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


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


_VALID_STATES = {"PRESENT", "UNVERIFIED", "ABSENT"}


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
