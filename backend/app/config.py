from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    vision_backend: str = "stub"
    reid_interval_s: float = 30.0
    miss_threshold: int = 3
    # Roll-call latch (single laptop webcam panning a room): once recognised,
    # a student stays PRESENT for the whole session. Off = classic present/
    # unverified/absent decay for a fixed multi-camera feed.
    presence_latch: bool = True
    cosine_threshold: float = 0.45
    enrollment_json: str = "enrollments.json"  # dev: load embeddings from file
    # reg_no -> full_name map so the live roster / capture overlay show names,
    # not bare ids. Ships with the 4MCA-B class list; embeddings still key on id.
    roster_json: str = "data/roster.json"
    # Known frontend origins only — never default to "*" on a service that
    # holds the server key and mints sessions.
    allow_origins: str = "http://localhost:5173"

    # Supabase write-path (Phase 2). Server-side only; the frontend reads Postgres
    # directly via RLS/Realtime. Leave supabase_url blank to run fully offline
    # (build_writer falls back to a no-op writer; tests never touch the network).
    supabase_url: str = ""
    # The sb_secret_ server key: authenticates as the service_role Postgres
    # role, bypasses RLS. One credential, one env var.
    supabase_secret_key: str = ""

    # RTSP capture source (Phase 3, backend/capture). The URL carries the
    # camera credentials — set it only via env; logs always mask the password.
    # Sample rates cap how many frames/second the pipeline processes; the
    # source itself drains the stream and keeps only the latest frame.
    rtsp_url: str = ""
    sample_fps_lecture: float = 2.0
    sample_fps_exam: float = 5.0

    # Exam-mode proctoring (Phase 3, backend/proctor). "stub" for dev/CI;
    # "yolo" needs pip install -e '.[proctor]'. Gaze-down suppression: a track
    # pitched below gaze_pitch_down_deg mutes its phone flags for gaze_window_s.
    proctor_backend: str = "stub"
    gaze_window_s: float = 10.0
    gaze_pitch_down_deg: float = -25.0
    proctor_cooldown_s: float = 30.0
    # YOLO confidence floor for proctor objects. 0.30 (not the library's 0.35)
    # so a hand-held phone at webcam distance is still caught; the human review
    # queue absorbs the few extra low-confidence candidates.
    proctor_conf: float = 0.30

    # VNEI engagement (Phase 3, backend/engagement). Zone bands are fractions
    # of frame height (camera at the front: lower in frame = nearer = front).
    # Aggregates only; zones under 5 tracked faces are suppressed (k-floor).
    engagement_window_s: float = 60.0
    zone_front_band: float = 0.66
    zone_back_band: float = 0.33
    # k-anonymity floor: zones with fewer than this many tracked faces are
    # suppressed (no per-few-people engagement). 5 in production (privacy); can
    # be lowered for a small controlled test so engagement is visible.
    engagement_k_min: int = 5

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
