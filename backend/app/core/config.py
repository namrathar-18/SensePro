"""
SensePro+ — Application configuration
All secrets come from environment variables / .env file.
Never hardcode credentials here.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ─── App ───────────────────────────────────────────────────────────────
    APP_NAME: str = "SensePro+"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # ─── Supabase ──────────────────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str          # service role key (backend only)
    SUPABASE_ANON_KEY: str             # anon key (passed to frontend)

    # ─── JWT (Supabase uses HS256) ─────────────────────────────────────────
    JWT_SECRET: str                    # same as Supabase JWT secret
    JWT_ALGORITHM: str = "HS256"

    # ─── Vision thresholds ─────────────────────────────────────────────────
    ARCFACE_THRESHOLD: float = 0.45    # cosine similarity; calibrate in Week 1
    FRAME_SAMPLE_RATE: int = 2         # fps from browser
    MAX_FRAME_WIDTH: int = 640         # downscale before send

    # ─── Presence FSM ──────────────────────────────────────────────────────
    GRACE_PERIOD_S: int = 90           # seconds before PRESENT → UNVERIFIED
    MISS_PERIOD_S: int = 300           # seconds before UNVERIFIED → ABSENT
    REID_INTERVAL_S: int = 30          # re-ID track against embeddings every N s

    # ─── Engagement ────────────────────────────────────────────────────────
    VNEI_MIN_STUDENTS: int = 5         # k-suppression threshold
    VNEI_WINDOW_S: int = 60            # aggregation window in seconds

    # ─── Proctor ──────────────────────────────────────────────────────────
    GAZE_DOWN_ANGLE_DEG: float = 25.0  # pitch below this = writing, suppress flag
    GAZE_SUSTAINED_S: float = 5.0      # seconds of gaze deviation before flagging

    # ─── CORS ─────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",        # Vite dev server
        "https://sensepro.vercel.app",  # production frontend
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
