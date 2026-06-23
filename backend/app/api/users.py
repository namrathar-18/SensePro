"""
SensePro+ — Users / Profiles API
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user, require_admin

router = APIRouter(prefix="/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    class_id: Optional[str] = None


@router.get("/me")
async def get_my_profile(user=Depends(get_current_user)):
    return user


@router.patch("/me")
async def update_my_profile(
    req: UpdateProfileRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    updates = req.model_dump(exclude_none=True)
    if not updates:
        return user
    result = db.table("profiles").update(updates).eq("id", user["id"]).execute()
    return result.data[0]


@router.get("/me/attendance")
async def my_attendance(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Student-lite: own attendance records only."""
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    intervals = db.table("presence_intervals") \
        .select("session_id, state, started_at, ended_at, duration_s, class_sessions(started_at, class_id, classes(name))") \
        .eq("student_id", user["id"]) \
        .order("started_at", desc=True) \
        .execute().data

    return {"student_id": user["id"], "intervals": intervals}


@router.get("/me/consent")
async def my_consent(db=Depends(get_db), user=Depends(get_current_user)):
    consent = db.table("consent_records") \
        .select("*") \
        .eq("student_id", user["id"]) \
        .execute().data
    return {"consents": consent}


@router.post("/me/delete-request")
async def request_data_deletion(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """DPDP right-to-deletion: student can request their own data be deleted."""
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    db.table("audit_log").insert({
        "actor_id":    user["id"],
        "action":      "data_deletion_requested",
        "entity_type": "student",
        "entity_id":   user["id"],
        "payload":     {"self_requested": True},
    }).execute()

    return {
        "message": "Deletion request logged. An admin will process this within 30 days per DPDP Act.",
        "student_id": user["id"],
    }


@router.get("/", dependencies=[Depends(require_admin)])
async def list_users(db=Depends(get_db)):
    """Admin: list all users."""
    users = db.table("profiles").select("*").execute().data
    return {"users": users}


@router.post("/", dependencies=[Depends(require_admin)])
async def create_user(
    full_name: str,
    email: str,
    role: str,
    student_id: Optional[str] = None,
    class_id: Optional[str] = None,
    db=Depends(get_db),
    admin=Depends(require_admin),
):
    """Admin: create a new user via Supabase Auth."""
    from app.core.database import get_supabase
    sb = get_supabase()

    # Create auth user
    auth_resp = sb.auth.admin.create_user({
        "email": email,
        "password": "ChangeMe123!",  # forced password change on first login
        "email_confirm": True,
    })
    uid = auth_resp.user.id

    # Create profile
    profile = db.table("profiles").insert({
        "id":         uid,
        "full_name":  full_name,
        "role":       role,
        "student_id": student_id,
        "class_id":   class_id,
    }).execute().data[0]

    db.table("audit_log").insert({
        "actor_id":    admin["id"],
        "action":      "user_created",
        "entity_type": "profile",
        "entity_id":   uid,
        "payload":     {"role": role, "email": email},
    }).execute()

    return profile
