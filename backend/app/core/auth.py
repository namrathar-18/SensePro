"""
SensePro+ — Auth helpers & FastAPI dependencies
Validates Supabase JWTs on protected routes.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings
from app.core.database import get_db

bearer = HTTPBearer()
settings = get_settings()


def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_aud": False},  # Supabase doesn't set aud by default
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db=Depends(get_db),
) -> dict:
    """Returns the Supabase user profile dict."""
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="No user id in token")

    result = db.table("profiles").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User profile not found")
    return result.data


def require_role(*roles: str):
    """Dependency factory: require one of the given roles."""
    def _check(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.get('role')}' not permitted. Required: {roles}",
            )
        return user
    return _check


# Convenience aliases
require_teacher    = require_role("teacher", "admin")
require_admin      = require_role("admin")
require_management = require_role("management", "admin")
