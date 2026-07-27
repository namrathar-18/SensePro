"""SensePro+ backend — browser-capture + server-side inference.

The classroom browser streams frames over the /ws/capture WebSocket; the server
runs detect -> track -> re-ID -> presence and streams results back. Frames are
processed in memory and never persisted (CLAUDE.md privacy invariant).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.sessions import router as sessions_router
from app.ws import router as ws_router

app = FastAPI(title="SensePro+ API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allow_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(ws_router)
app.include_router(sessions_router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "sensepro-backend",
        "vision_backend": settings.vision_backend,
    }
