"""
SensePro+ — WebSocket Frame Handler

Receives JPEG frames from the browser, runs the vision pipeline,
pushes recognition results back to the client, and persists state.

Message protocol (JSON):
  Browser → Server:
    { "type": "frame",  "data": "<base64 JPEG>", "ts": 1234567890.123 }
    { "type": "init",   "session_id": "uuid", "token": "jwt" }
    { "type": "ping" }

  Server → Browser:
    { "type": "recognition", "faces": [...], "presence_summary": {...}, "latency_ms": N }
    { "type": "proctor_flag", "flag": {...} }
    { "type": "error", "message": "..." }
    { "type": "pong" }
"""
import time
import base64
import asyncio
import logging
import json
from fastapi import WebSocket, WebSocketDisconnect
from app.vision.pipeline import FacePipeline
from app.services.presence_fsm import PresenceFSM, PresenceState
from app.services.proctor import ProctorService
from app.services.vnei import VNEIAggregator, EngagementSignal, assign_zone
from app.services.vnei import head_pose_to_score
from app.core.database import get_supabase
from app.core.config import get_settings
import numpy as np
import cv2

logger = logging.getLogger(__name__)
settings = get_settings()

# Singleton vision models (loaded once at startup, shared across sessions)
_pipeline: FacePipeline | None = None
_proctor:  ProctorService | None = None


def get_pipeline() -> FacePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = FacePipeline()
    return _pipeline


def get_proctor() -> ProctorService:
    global _proctor
    if _proctor is None:
        _proctor = ProctorService()
    return _proctor


async def handle_websocket(ws: WebSocket):
    """
    Main WebSocket handler. One connection per classroom capture device.
    """
    await ws.accept()
    db = get_supabase()
    pipeline = get_pipeline()
    proctor  = get_proctor()

    session_id: str | None = None
    fsm: PresenceFSM | None = None
    vnei = VNEIAggregator()
    session_mode = "attendance"
    frame_count = 0
    vnei_last_flush = time.time()

    # Tick task: runs FSM timeout checks every 5 seconds
    async def _tick_loop():
        while True:
            await asyncio.sleep(5)
            if fsm:
                await fsm.tick()
                snapshot = fsm.get_snapshot()
                # Push presence update via Supabase Realtime (handled by DB trigger)

    tick_task = asyncio.create_task(_tick_loop())

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            # ─── Ping / keepalive ─────────────────────────────────────────
            if msg_type == "ping":
                await ws.send_json({"type": "pong"})
                continue

            # ─── Session init ─────────────────────────────────────────────
            if msg_type == "init":
                session_id   = msg["session_id"]
                session_mode = msg.get("mode", "attendance")
                proctor.reset_session()
                vnei.reset_window(time.time())

                # Load session info + students
                session = db.table("class_sessions") \
                    .select("*, classes(*)") \
                    .eq("id", session_id) \
                    .single().execute().data

                if not session:
                    await ws.send_json({"type": "error", "message": "Session not found"})
                    continue

                # Load enrolled students for this class
                students = db.table("profiles") \
                    .select("id") \
                    .eq("class_id", session["class_id"]) \
                    .execute().data
                student_ids = [s["id"] for s in students]

                # Load embeddings into pipeline memory
                emb_rows = db.table("embeddings") \
                    .select("student_id, embedding") \
                    .in_("student_id", student_ids) \
                    .execute().data
                emb_map: dict[str, list] = {}
                for row in emb_rows:
                    emb_map.setdefault(row["student_id"], []).append(row["embedding"])
                pipeline.load_embeddings(emb_map)

                # Init FSM
                fsm = PresenceFSM(
                    session_id=session_id,
                    student_ids=student_ids,
                    on_interval_open=_open_interval,
                    on_interval_close=_close_interval,
                )

                await ws.send_json({
                    "type": "init_ok",
                    "session_id": session_id,
                    "student_count": len(student_ids),
                    "mode": session_mode,
                })
                logger.info(f"Session {session_id} initialised, {len(student_ids)} students, mode={session_mode}")
                continue

            # ─── Frame processing ─────────────────────────────────────────
            if msg_type == "frame":
                if not session_id or not fsm:
                    await ws.send_json({"type": "error", "message": "Send init first"})
                    continue

                t0 = time.time()
                jpeg_b64 = msg["data"]
                jpeg_bytes = base64.b64decode(jpeg_b64)

                # Run vision pipeline (JPEG decoded + discarded inside)
                faces = pipeline.process_frame(jpeg_bytes)
                frame_count += 1

                # Head poses + engagement signals
                head_poses = {}
                now = time.time()
                vnei_signals: list[EngagementSignal] = []

                for face in faces:
                    pose = pipeline.get_head_pose(face.landmarks)
                    ear  = pipeline.compute_eye_aspect_ratio(face.landmarks)
                    zone = assign_zone(face.bbox, settings.MAX_FRAME_WIDTH, 480)

                    if face.identity:
                        head_poses[face.identity] = pose
                        await fsm.on_detection(face.identity)

                        vnei_signals.append(EngagementSignal(
                            student_id=face.identity,
                            zone=zone,
                            head_pose_score=head_pose_to_score(pose["yaw"], pose["pitch"]),
                            eye_closure_score=1.0 if ear > 0.2 else 0.0,
                            phone_score=1.0,   # overridden below if phone detected
                            stillness_score=1.0,
                        ))

                for sig in vnei_signals:
                    vnei.add_signal(sig)

                # Proctor mode
                proctor_flags = []
                if session_mode == "exam":
                    # Decode image again for YOLO (pipeline already discarded it)
                    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
                    img_for_yolo = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if img_for_yolo is not None:
                        flags = proctor.process_frame(
                            img_for_yolo, faces, head_poses,
                            img_for_yolo.shape[1], img_for_yolo.shape[0],
                        )
                        del img_for_yolo
                        for flag in flags:
                            if not flag.suppressed:
                                proctor_flags.append(flag)
                                # Persist to proctor_flags table
                                db.table("proctor_flags").insert({
                                    "session_id": session_id,
                                    "flag_type":  flag.flag_type,
                                    "confidence": flag.confidence,
                                    "zone":       flag.zone,
                                    "detected_at": now,
                                }).execute()
                                await ws.send_json({
                                    "type":      "proctor_flag",
                                    "flag_type": flag.flag_type,
                                    "confidence": flag.confidence,
                                    "zone":      flag.zone,
                                })

                # Flush VNEI every window
                if now - vnei_last_flush >= settings.VNEI_WINDOW_S:
                    zone_results = vnei.compute(now)
                    for zr in zone_results:
                        zr["session_id"] = session_id
                        db.table("engagement_zone_aggregates").insert(zr).execute()
                    vnei.reset_window(now)
                    vnei_last_flush = now

                latency_ms = int((time.time() - t0) * 1000)

                # Send recognition result back
                await ws.send_json({
                    "type": "recognition",
                    "faces": [
                        {
                            "bbox":           f.bbox,
                            "identity":       f.identity,
                            "identity_score": round(f.identity_score, 3),
                            "det_score":      round(f.det_score, 3),
                        }
                        for f in faces
                    ],
                    "presence_summary": fsm.summary(),
                    "latency_ms": latency_ms,
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected (session={session_id})")
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        tick_task.cancel()
        if fsm:
            await fsm.close_all()
            logger.info(f"Session {session_id} closed after {frame_count} frames")


# ─── DB helper callbacks ────────────────────────────────────────────────────

async def _open_interval(session_id: str, student_id: str, state: str, ts: float) -> str:
    db = get_supabase()
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    result = db.table("presence_intervals").insert({
        "session_id": session_id,
        "student_id": student_id,
        "state":      state,
        "started_at": dt,
    }).execute()
    return result.data[0]["id"]


async def _close_interval(interval_id: str, ts: float):
    db = get_supabase()
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    db.table("presence_intervals") \
        .update({"ended_at": dt}) \
        .eq("id", interval_id) \
        .execute()
