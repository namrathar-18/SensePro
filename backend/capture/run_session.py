"""Run a class session from an RTSP camera (or any frame source).

    python -m capture.run_session --rtsp "rtsp://..." --session <id> --mode lecture

The pipeline is transport-agnostic: the WS endpoint feeds it browser frames,
this runner feeds it camera frames, and both drive the SAME
SessionPipeline.process_frame + SessionRecorder write-path. The runner depends
only on the FrameSource protocol below — anything with latest()/stop() works,
which is how tests drive it with synthetic frames and zero network.

Timestamps: the pipeline and recorder use seconds-relative-to-session-start
(the WS path gets them from the client; here they come from a monotonic
clock). The recorder converts them to absolute times against session_start.

The runner samples — it processes the newest frame at SAMPLE_FPS_* and lets
the source discard everything in between. It never creates or ends the
class_sessions row: the session id comes from POST /v1/sessions, same as the
browser path. Frames stay in memory, always.
"""

from __future__ import annotations

import argparse
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

import numpy as np

from app.config import settings
from app.store import SessionRecorder, build_writer
from capture.rtsp_source import RtspSource
from engagement.signals import SignalExtractor
from engagement.vnei import ZONES, ZoneAggregator
from proctor.detector import ObjectDetection, build_proctor_detector
from proctor.engine import ProctorEngine
from proctor.suppression import GazeSuppressor
from vision.embedding_store import EmbeddingStore
from vision.pipeline import SessionPipeline

logger = logging.getLogger("sensepro.capture")

FrameObserver = Callable[[np.ndarray, float], None]


@dataclass
class ProctorView:
    """The latest exam-mode detections + flags raised on the current frame,
    mutated in place each processed frame. The WS path reads this after the
    observers run so the capture overlay can *show* the phone / extra person
    (and WHO it belongs to) — otherwise proctoring is invisible until a teacher
    opens the review queue. Empty in lecture mode (no object detector runs).

    detections: [{"label","box","confidence","student_id"}] — student_id is the
    reg_no of the nearest recognised face for a phone (the likely owner), else
    None. new_flags: [{"flag_type","student_id"}] as actually written this frame.
    Names are resolved downstream (ws_result) where the roster map lives."""

    detections: list[dict] = field(default_factory=list)
    new_flags: list[dict] = field(default_factory=list)
    # Class-level engagement summary for THIS frame (aggregate, no identity):
    # {"visible","attending","head_down","vnei","k_min","suppressed"}. Suppressed
    # (blank on the UI) below the k-anonymity floor, exactly like the stored
    # zone aggregates — so a solo test only shows it when k_min is lowered.
    engagement: dict = field(default_factory=dict)


def _nearest_identified_track(det: ObjectDetection, tracks) -> object | None:
    """Nearest track that HAS an identity, by box-centre distance — used to name
    the likely phone owner on the live overlay. Unlike the engine's flag
    attribution (which caps distance to avoid false blame in a crowd), this has
    no cap: in a single-webcam room the nearest recognised face is the owner."""
    dx, dy = _centre(det.box)
    best = None
    for tr in tracks:
        if not tr.student_id:
            continue
        tx, ty = _centre(tr.det.box)
        dist = ((dx - tx) ** 2 + (dy - ty) ** 2) ** 0.5
        if best is None or dist < best[0]:
            best = (dist, tr)
    return best[1] if best else None


def _centre(box: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _attribute_dets(dets: list[ObjectDetection], tracks) -> list[dict]:
    """Shape detections for the overlay, naming the likely owner (nearest
    recognised face) of each phone so the UI can say who is holding it."""
    out: list[dict] = []
    for d in dets:
        owner = _nearest_identified_track(d, tracks) if d.label == "cell phone" else None
        out.append(
            {
                "label": d.label,
                "box": list(d.box),
                "confidence": round(d.confidence, 2),
                "student_id": owner.student_id if owner else None,
            }
        )
    return out


class FrameSource(Protocol):
    def latest(self) -> tuple[np.ndarray, float] | None: ...
    def stop(self) -> None: ...


def _load_store() -> EmbeddingStore:
    path = Path(settings.enrollment_json)
    if path.exists():
        return EmbeddingStore.from_json(path, threshold=settings.cosine_threshold)
    return EmbeddingStore(threshold=settings.cosine_threshold)


def run_loop(
    source: FrameSource,
    pipeline: SessionPipeline,
    recorder: SessionRecorder | None,
    sample_fps: float,
    *,
    observers: Sequence[FrameObserver] = (),
    clock=time.monotonic,
    sleep=time.sleep,
    max_frames: int | None = None,
) -> int:
    """Sample the newest frame at sample_fps and drive the pipeline.

    Observers (proctor engine, engagement aggregation) run after each
    processed frame and may read `pipeline.last_tracks` — so all Phase-3
    analysis happens at the sampled rate, never the camera rate. Returns the
    number of frames processed. Always closes open presence intervals and
    stops the source on the way out — including on Ctrl+C. `clock`/`sleep`/
    `max_frames` are injectable so tests run deterministically and instantly.
    """
    period = 1.0 / sample_fps
    t0 = clock()
    last_frame_ts: float | None = None
    processed = 0
    try:
        while max_frames is None or processed < max_frames:
            tick = clock()
            got = source.latest()
            if got is not None:
                frame, frame_ts = got
                if frame_ts != last_frame_ts:  # skip if the source has nothing new
                    last_frame_ts = frame_ts
                    rel_ts = clock() - t0
                    result = pipeline.process_frame(frame, rel_ts)
                    if recorder is not None and result["transitions"]:
                        transitions = [(t["student_id"], t["state"]) for t in result["transitions"]]
                        recorder.record(transitions, rel_ts)
                    for observe in observers:
                        observe(frame, rel_ts)
                    processed += 1
            remaining = period - (clock() - tick)
            if remaining > 0:
                sleep(remaining)
    finally:
        if recorder is not None:
            recorder.close(clock() - t0)
        source.stop()
    return processed


def _parse_enrolled(spec: str, roster_size: int) -> dict[str, int]:
    """Per-zone enrolment for coverage. students.seat_zone is not populated
    yet, so the default is an even split of the enrolled roster — a documented
    approximation, not a claim."""
    if spec:
        pairs = (part.split("=", 1) for part in spec.split(","))
        return {zone.strip(): int(count) for zone, count in pairs}
    q, r = divmod(roster_size, 3)
    return {zone: q + (1 if i < r else 0) for i, zone in enumerate(ZONES)}


def build_observers(
    mode: str,
    pipeline: SessionPipeline,
    writer,
    session_id: str,
    session_start: datetime,
    enrolled_by_zone: dict[str, int],
    student_id_map: dict[str, str] | None = None,
) -> tuple[list[FrameObserver], ZoneAggregator, ProctorView]:
    """Exam mode adds the proctor engine; engagement aggregates in both modes.
    One detector pass per sampled frame serves both consumers — in lecture
    mode there is no object detector, so phone signals are simply absent.

    Returns a ProctorView too: the caller can read the current frame's phone /
    person detections (to draw them live) without re-running the detector.
    student_id_map (reg_no->UUID) lets the proctor write flags against the real
    students FK — without it, attributed flags are rejected by the DB."""
    engine = None
    if mode == "exam":
        engine = ProctorEngine(
            detector=build_proctor_detector(),
            suppressor=GazeSuppressor(
                window_s=settings.gaze_window_s,
                pitch_down_deg=settings.gaze_pitch_down_deg,
            ),
            writer=writer,
            session_id=session_id,
            session_start=session_start,
            cooldown_s=settings.proctor_cooldown_s,
            student_id_map=student_id_map or {},
        )
    extractor = SignalExtractor(attend_pitch_deg=settings.engagement_head_down_pitch_deg)
    aggregator = ZoneAggregator(
        session_id=session_id,
        writer=writer,
        session_start=session_start,
        enrolled_by_zone=enrolled_by_zone,
        window_s=settings.engagement_window_s,
        front_band=settings.zone_front_band,
        back_band=settings.zone_back_band,
        k_min=settings.engagement_k_min,
    )

    view = ProctorView()

    # Lecture mode: run the phone detector too — but only as an engagement /
    # DISTRACTION signal (a phone lowers attention), never a proctor flag.
    # Throttled so it doesn't slow attendance panning; exam mode already detects
    # every frame via the engine, so this is skipped there.
    lecture_detector = None
    if engine is None and settings.lecture_phone_signal:
        lecture_detector = build_proctor_detector()
    last_detect = {"ts": -1e9, "dets": []}

    def frame_observer(frame: np.ndarray, rel_ts: float) -> None:
        tracks = pipeline.last_tracks
        phone_dets: list[ObjectDetection] = []
        if engine is not None:
            # Exam: detect every frame + raise proctor flags for the review queue.
            dets = engine.detector.detect(frame)
            flags = engine.observe(frame, tracks, rel_ts, detections=dets)
            phone_dets = [d for d in dets if d.label == "cell phone"]
            view.detections = _attribute_dets(dets, tracks)
            view.new_flags = [{"flag_type": f.flag_type, "student_id": f.student_id} for f in flags]
        elif lecture_detector is not None:
            # Lecture: throttled detect; reuse the last result between runs for a
            # stable overlay + signal. No proctor flags — distraction only.
            if rel_ts - last_detect["ts"] >= settings.lecture_phone_interval_s:
                last_detect["dets"] = lecture_detector.detect(frame)
                last_detect["ts"] = rel_ts
            dets = last_detect["dets"]
            phone_dets = [d for d in dets if d.label == "cell phone"]
            view.detections = _attribute_dets(dets, tracks)
            view.new_flags = []

        signals = extractor.extract(tracks, phone_dets, frame.shape[:2])
        # Live class-level engagement (aggregate only). A track is attending when
        # its head is up (pitch above the band) AND no phone is next to it;
        # head_down is the "sleeping" proxy, phone the "distraction" proxy. A
        # track only counts as "visible" once the backend can read its head pose.
        vals = [signals[t.track_id] for t in tracks]
        visible = [s for s in vals if s.head_down is not None]
        n_vis = len(visible)
        n_down = sum(1 for s in visible if s.head_down)
        n_phone = sum(1 for s in visible if s.phone_nearby)
        n_attend = sum(1 for s in visible if not s.head_down and not s.phone_nearby)
        view.engagement = {
            "visible": n_vis,
            "attending": n_attend,
            "head_down": n_down,
            "phone": n_phone,
            "vnei": round(n_attend / n_vis, 2) if n_vis else None,
            "k_min": settings.engagement_k_min,
            "suppressed": n_vis < settings.engagement_k_min,
        }
        aggregator.observe([(t, signals[t.track_id]) for t in tracks], frame.shape[0], rel_ts)

    return [frame_observer], aggregator, view


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="capture.run_session",
        description="Feed an RTSP camera into the live presence pipeline.",
    )
    parser.add_argument("--rtsp", default="", help="RTSP URL (default: RTSP_URL from env)")
    parser.add_argument("--session", required=True, help="class_sessions id to attach to")
    parser.add_argument("--mode", choices=("lecture", "exam"), default="lecture")
    parser.add_argument(
        "--max-seconds", type=float, default=None, help="stop after ~N seconds (default: Ctrl+C)"
    )
    parser.add_argument(
        "--enrolled",
        default="",
        help="per-zone enrolment, e.g. front=18,mid=18,back=17 (default: even roster split)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    url = args.rtsp or settings.rtsp_url
    if not url:
        parser.error("no RTSP URL: pass --rtsp or set RTSP_URL")

    fps = settings.sample_fps_exam if args.mode == "exam" else settings.sample_fps_lecture
    store = _load_store()
    pipeline = SessionPipeline(
        store=store,
        reid_interval_s=settings.reid_interval_s,
        miss_threshold=settings.miss_threshold,
        latch=settings.presence_latch,
    )
    writer = build_writer()
    session_start = datetime.now(UTC)
    recorder = SessionRecorder(writer=writer, session_id=args.session, session_start=session_start)
    observers, aggregator, _ = build_observers(
        mode=args.mode,
        pipeline=pipeline,
        writer=writer,
        session_id=args.session,
        session_start=session_start,
        enrolled_by_zone=_parse_enrolled(args.enrolled, len(store.roster)),
    )
    source = RtspSource(url)
    source.start()
    max_frames = int(args.max_seconds * fps) if args.max_seconds else None
    try:
        n = run_loop(source, pipeline, recorder, fps, observers=observers, max_frames=max_frames)
        logger.info("session done: %d frames processed", n)
    except KeyboardInterrupt:
        logger.info("interrupted — open intervals closed, source stopped")
    finally:
        aggregator.flush()  # close the trailing engagement window


if __name__ == "__main__":
    main()
