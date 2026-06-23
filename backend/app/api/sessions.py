"""
SensePro+ — Session management + attendance API
Handles: start/stop sessions, roster, presence summary, PDF report export.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import require_teacher, require_management, require_admin, get_current_user
from app.services.report import generate_attendance_pdf

router = APIRouter(prefix="/sessions", tags=["sessions"])


class StartSessionRequest(BaseModel):
    class_id: str
    device_id: Optional[str] = None
    mode: str = "attendance"  # 'attendance' | 'exam'


@router.post("/start")
async def start_session(
    req: StartSessionRequest,
    db=Depends(get_db),
    teacher=Depends(require_teacher),
):
    """Start a new class session. Teacher must own the class."""
    # Verify teacher owns the class
    cls = db.table("classes") \
        .select("id") \
        .eq("id", req.class_id) \
        .eq("teacher_id", teacher["id"]) \
        .single().execute()

    if not cls.data:
        raise HTTPException(status_code=403, detail="Not your class")

    session = db.table("class_sessions").insert({
        "class_id":   req.class_id,
        "teacher_id": teacher["id"],
        "device_id":  req.device_id,
        "mode":       req.mode,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute().data[0]

    # Audit
    db.table("audit_log").insert({
        "actor_id":    teacher["id"],
        "action":      "session_started",
        "entity_type": "class_session",
        "entity_id":   session["id"],
        "payload":     {"mode": req.mode, "class_id": req.class_id},
    }).execute()

    return session


@router.post("/{session_id}/stop")
async def stop_session(
    session_id: str,
    db=Depends(get_db),
    teacher=Depends(require_teacher),
):
    """Stop an active session."""
    session = db.table("class_sessions") \
        .select("*") \
        .eq("id", session_id) \
        .eq("teacher_id", teacher["id"]) \
        .single().execute().data

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("ended_at"):
        raise HTTPException(status_code=400, detail="Session already ended")

    now = datetime.now(timezone.utc).isoformat()
    db.table("class_sessions") \
        .update({"ended_at": now}) \
        .eq("id", session_id) \
        .execute()

    # Close any open presence_intervals
    db.rpc("close_open_intervals", {
        "p_session_id": session_id,
        "p_ended_at":   now,
    }).execute()

    db.table("audit_log").insert({
        "actor_id":    teacher["id"],
        "action":      "session_stopped",
        "entity_type": "class_session",
        "entity_id":   session_id,
    }).execute()

    return {"stopped": True, "ended_at": now}


@router.get("/{session_id}/roster")
async def get_roster(
    session_id: str,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Live roster: per-student presence state and duration.
    Returns aggregate presence data — not engagement data.
    """
    # Get all presence intervals for this session
    intervals = db.table("presence_intervals") \
        .select("student_id, state, started_at, ended_at, duration_s") \
        .eq("session_id", session_id) \
        .execute().data

    # Aggregate per student
    student_data: dict[str, dict] = {}
    for iv in intervals:
        sid = iv["student_id"]
        if sid not in student_data:
            student_data[sid] = {
                "student_id":    sid,
                "present_s":     0,
                "unverified_s":  0,
                "current_state": "ABSENT",
                "last_seen":     None,
            }
        sd = student_data[sid]
        dur = iv.get("duration_s") or 0
        if iv["state"] == "PRESENT":
            sd["present_s"] += dur
        elif iv["state"] == "UNVERIFIED":
            sd["unverified_s"] += dur
        if iv.get("ended_at") is None:  # still open = current state
            sd["current_state"] = iv["state"]
            sd["last_seen"] = iv["started_at"]

    # Join student names
    if student_data:
        profiles = db.table("profiles") \
            .select("id, full_name, student_id") \
            .in_("id", list(student_data.keys())) \
            .execute().data
        for p in profiles:
            if p["id"] in student_data:
                student_data[p["id"]]["full_name"] = p.get("full_name", "")
                student_data[p["id"]]["student_number"] = p.get("student_id", "")

    return {"session_id": session_id, "roster": list(student_data.values())}


@router.get("/{session_id}/report.pdf")
async def export_pdf_report(
    session_id: str,
    db=Depends(get_db),
    teacher=Depends(require_teacher),
):
    """Export attendance report as PDF."""
    # Fetch session
    session = db.table("class_sessions") \
        .select("*, classes(name)") \
        .eq("id", session_id) \
        .single().execute().data

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Fetch roster
    roster_resp = await get_roster(session_id, db, teacher)
    roster = roster_resp["roster"]

    pdf_bytes = generate_attendance_pdf(session, roster)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="attendance_{session_id[:8]}.pdf"'
        },
    )


@router.get("/{session_id}/proctor-flags")
async def get_proctor_flags(
    session_id: str,
    db=Depends(get_db),
    teacher=Depends(require_teacher),
):
    """Get human review queue for a session."""
    flags = db.table("proctor_flags") \
        .select("*") \
        .eq("session_id", session_id) \
        .order("detected_at", desc=True) \
        .execute().data
    return {"session_id": session_id, "flags": flags}


@router.post("/{session_id}/proctor-flags/{flag_id}/review")
async def review_flag(
    session_id: str,
    flag_id: str,
    note: str = "",
    db=Depends(get_db),
    teacher=Depends(require_teacher),
):
    """Mark a proctor flag as reviewed. No auto-penalty — human decision only."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db.table("proctor_flags") \
        .update({
            "reviewer_id":  teacher["id"],
            "reviewed_at":  now,
            "review_note":  note,
        }) \
        .eq("id", flag_id) \
        .execute()

    db.table("audit_log").insert({
        "actor_id":    teacher["id"],
        "action":      "flag_reviewed",
        "entity_type": "proctor_flag",
        "entity_id":   flag_id,
        "payload":     {"note": note},
    }).execute()

    return {"reviewed": True}


@router.get("/{session_id}/engagement")
async def get_engagement(
    session_id: str,
    db=Depends(get_db),
    user=Depends(require_management),
):
    """
    Zone-level VNEI engagement aggregates.
    Only management and admin can access this.
    Student-level engagement DOES NOT EXIST in this system.
    """
    aggregates = db.table("engagement_zone_aggregates") \
        .select("zone, window_start, window_end, student_count, vnei_score, coverage_ratio, head_pose_avg, eye_closure_avg, phone_rate, stillness_avg") \
        .eq("session_id", session_id) \
        .order("window_start") \
        .execute().data

    # Compute naive mean for bias comparison
    from app.services.vnei import VNEIAggregator
    latest = [a for a in aggregates if a.get("vnei_score") is not None]
    naive_mean = VNEIAggregator.compute_naive_mean(latest)
    vnei_weighted = VNEIAggregator.compute_vnei_weighted(latest)

    return {
        "session_id":    session_id,
        "aggregates":    aggregates,
        "bias_chart": {
            "naive_mean":    naive_mean,
            "vnei_weighted": vnei_weighted,
            "bias_delta":    round(vnei_weighted - naive_mean, 4),
            "description":   "Positive delta = VNEI gives more weight to less-visible zones",
        },
    }
