"""Student roster admin (write-path only), matching the sessions API style.

POST /v1/students  -> create/upsert a student roster record (identity row).

The face embedding is a SEPARATE step (the enrol CLI computes it from captured
frames); this endpoint only creates the roster identity so the student appears
in dashboards. Writes go through the service-role PresenceWriter.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.store import build_writer

router = APIRouter(prefix="/v1/students", tags=["students"])

_ZONES = ("front", "mid", "back")


class StudentCreate(BaseModel):
    reg_no: str
    full_name: str
    class_section: str = "4MCA-B"
    seat_zone: str = "mid"


class StudentOut(BaseModel):
    id: str
    reg_no: str
    full_name: str
    class_section: str
    seat_zone: str


@router.post("", status_code=201, response_model=StudentOut)
def create_student(body: StudentCreate) -> StudentOut:
    reg_no = body.reg_no.strip()
    full_name = body.full_name.strip()
    if not reg_no or not full_name:
        raise HTTPException(status_code=400, detail="reg_no and full_name are required")
    seat_zone = body.seat_zone if body.seat_zone in _ZONES else "mid"
    writer = build_writer()
    try:
        sid = writer.create_student(reg_no, full_name, body.class_section, seat_zone)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"student create failed: {exc}") from exc
    return StudentOut(
        id=sid,
        reg_no=reg_no,
        full_name=full_name,
        class_section=body.class_section,
        seat_zone=seat_zone,
    )
