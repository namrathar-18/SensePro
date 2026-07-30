"""SensePro+ backend — browser-capture + server-side inference.

The classroom browser streams frames over the /ws/capture WebSocket; the server
runs detect -> track -> re-ID -> presence and streams results back. Frames are
processed in memory and never persisted (core privacy invariant).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.sessions import router as sessions_router
from app.students import router as students_router
from app.ws import router as ws_router

logger = logging.getLogger("sensepro.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the vision model ONCE at startup (off the event loop) so the first
    # WebSocket connection is instant instead of blocking ~5-10s on model load.
    if settings.vision_backend.lower() == "insightface":
        logger.info("warming insightface model at startup…")
        from vision.pipeline import build_backend

        await run_in_threadpool(build_backend)
        logger.info("insightface model ready")
    yield


app = FastAPI(title="SensePro+ API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allow_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(ws_router)
app.include_router(sessions_router)
app.include_router(students_router)


@app.get("/health")
def health() -> dict:
    # Report the ACTUAL loaded backend, not just the configured name — so a
    # silent fallback to the stub is visible here instead of looking healthy.
    from vision.pipeline import build_backend

    detector, _ = build_backend()
    return {
        "status": "ok",
        "service": "sensepro-backend",
        "vision_backend": settings.vision_backend,
        "vision_backend_active": type(detector).__name__,
    }
