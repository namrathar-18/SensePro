"""
SensePro+ — Supabase client (service-role, backend only)
Use this for all DB operations from the backend.
"""
from functools import lru_cache
from supabase import create_client, Client
from app.core.config import get_settings


@lru_cache()
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_db() -> Client:
    """FastAPI dependency injection"""
    return get_supabase()
