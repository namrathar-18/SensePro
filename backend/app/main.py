"""
SensePro+ — FastAPI Application Entry Point
"""
import logging
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api import enrollment, sessions
from app.api.websocket_handler import handle_websocket

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="SensePro+ API",
    version="1.0.0",
    description="Browser-based attendance, proctoring & engagement analytics",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(enrollment.router, prefix="/api/v1")
app.include_router(sessions.router,   prefix="/api/v1")

@app.websocket("/ws/capture")
async def capture_ws(ws: WebSocket):
    await handle_websocket(ws)

@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}

@app.on_event("startup")
async def startup():
    logger.info("SensePro+ backend starting up...")
    from app.api.websocket_handler import get_pipeline, get_proctor
    get_pipeline()
    get_proctor()
    logger.info("Models loaded. Ready.")
