"""WebSocket capture endpoint — the laptop-webcam path.

Client -> server messages (JSON):
  {"type":"frame","ts":<float>,"jpg_b64":"<base64 jpeg>"}
  {"type":"end"}
Query params (or the first frame): ?session_id=<uuid>&mode=lecture|exam
  session_id attaches presence/flags/engagement writes to a real class_sessions
  row; without one, recognition still runs live but nothing persists (the
  offline demo loop). mode=exam additionally runs the proctor engine.

Server -> client (JSON): the enriched result the browser overlay consumes —
faces, present roster (with names + reg nos), enter/leave transitions, and the
size of the frame the server actually scored (so the overlay maps boxes back).

The browser is one capture source; capture/run_session.py is another (RTSP).
Both drive the SAME SessionPipeline + observers, so exam proctoring and VNEI
engagement run identically from the webcam and from a camera. Frames are
processed in memory and never persisted (core privacy invariant).
"""

from __future__ import annotations

import base64
import binascii
import logging
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.roster_names import load_roster_names
from app.store import SessionRecorder, build_writer
from app.ws_result import WsEnricher
from capture.run_session import build_observers
from vision.embedding_store import EmbeddingStore
from vision.pipeline import SessionPipeline

router = APIRouter()
logger = logging.getLogger("sensepro.ws")


def _load_store() -> EmbeddingStore:
    path = Path(settings.enrollment_json)
    if path.exists():
        return EmbeddingStore.from_json(path, threshold=settings.cosine_threshold)
    return EmbeddingStore(threshold=settings.cosine_threshold)


def _even_zone_split(roster_size: int) -> dict[str, int]:
    """Per-zone enrolment for coverage — even split of the roster until seat
    maps are populated (documented approximation, mirrors run_session)."""
    from engagement.vnei import ZONES

    q, r = divmod(roster_size, len(ZONES))
    return {zone: q + (1 if i < r else 0) for i, zone in enumerate(ZONES)}


def _load_student_id_map() -> dict[str, str]:
    """reg_no -> students.id (UUID) from Supabase, so presence writes use the
    real FK. Empty when Supabase isn't configured (the offline loop persists
    nothing anyway)."""
    if not settings.supabase_enabled:
        return {}
    try:
        import httpx

        r = httpx.get(
            settings.supabase_url.rstrip("/") + "/rest/v1/students",
            params={"select": "id,reg_no"},
            headers={
                "apikey": settings.supabase_secret_key,
                "Authorization": f"Bearer {settings.supabase_secret_key}",
            },
            timeout=10.0,
        )
        r.raise_for_status()
        return {row["reg_no"]: row["id"] for row in r.json()}
    except Exception as exc:  # noqa: BLE001
        logger.warning("student id map load failed: %s", exc)
        return {}


def _decode_jpg(b64: str) -> np.ndarray | None:
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


@router.websocket("/ws/capture")
async def capture(ws: WebSocket) -> None:
    await ws.accept()
    store = _load_store()
    pipe = SessionPipeline(
        store=store,
        reid_interval_s=settings.reid_interval_s,
        miss_threshold=settings.miss_threshold,
        latch=settings.presence_latch,
    )
    enricher = WsEnricher(load_roster_names(settings.roster_json))
    mode = ws.query_params.get("mode", "lecture")

    # A session_id attaches presence + proctor + engagement writes to a real
    # class_sessions row. Without one, recognition still runs but nothing
    # persists — the offline stub/demo loop. All state below is set on attach.
    recorder: SessionRecorder | None = None
    observers: list = []
    aggregator = None
    proctor_view = None
    session_start = datetime.now(UTC)

    def _attach(session_id: str | None) -> None:
        nonlocal recorder, observers, aggregator, proctor_view
        if not session_id or recorder is not None:
            return
        writer = build_writer()
        id_map = _load_student_id_map()  # reg_no -> UUID, shared by presence + proctor
        recorder = SessionRecorder(
            writer=writer,
            session_id=session_id,
            session_start=session_start,
            student_id_map=id_map,
        )
        observers, aggregator, proctor_view = build_observers(
            mode=mode,
            pipeline=pipe,
            writer=writer,
            session_id=session_id,
            session_start=session_start,
            enrolled_by_zone=_even_zone_split(len(store.roster)),
            student_id_map=id_map,
        )

    _attach(ws.query_params.get("session_id"))

    def _process(frame: np.ndarray, ts: float) -> dict:
        """Detect/track/re-ID, persist transitions, then run the Phase-3
        observers (proctor in exam mode, engagement always). Runs off the event
        loop because both the pipeline and the DB writes are synchronous."""
        result = pipe.process_frame(frame, ts)
        if recorder is not None and result["transitions"]:
            transitions = [(t["student_id"], t["state"]) for t in result["transitions"]]
            recorder.record(transitions, ts)
        for observe in observers:
            observe(frame, ts)
        # Surface exam-mode proctor detections so the overlay can draw the phone
        # / extra person live. The observers already ran the detector this frame;
        # we only read what they found. Empty outside exam mode.
        if proctor_view is not None:
            result["proctor"] = {
                "detections": proctor_view.detections,
                "flags": proctor_view.new_flags,
            }
            result["engagement"] = proctor_view.engagement
        return result

    try:
        while True:
            msg = await ws.receive_json()
            _attach(msg.get("session_id"))  # allow the first frame to carry it
            if msg.get("type") == "end":
                ts = float(msg.get("ts", 0.0))
                pipe.fsm.end_session(ts)
                # Closing writes must never prevent the client from getting its
                # session_ended ack — swallow and log any late write failure.
                if recorder is not None:
                    try:
                        await run_in_threadpool(recorder.close, ts)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("recorder close failed: %s", exc)
                if aggregator is not None:
                    try:
                        await run_in_threadpool(aggregator.flush)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("aggregator flush failed: %s", exc)
                await ws.send_json({"type": "session_ended", "ts": ts})
                break
            if msg.get("type") != "frame":
                await ws.send_json({"type": "error", "detail": "unknown message type"})
                continue
            frame = _decode_jpg(msg.get("jpg_b64", ""))
            if frame is None:
                await ws.send_json({"type": "error", "detail": "bad frame"})
                continue
            ts = float(msg.get("ts", 0.0))
            result = await run_in_threadpool(_process, frame, ts)
            enriched = enricher.enrich(result, frame.shape[0], frame.shape[1])
            await ws.send_json(enriched)
    except WebSocketDisconnect:
        return
    except Exception as exc:  # noqa: BLE001 — a dropped/closing socket must not 500-log
        logger.info("capture socket closed: %s", exc)
        return
