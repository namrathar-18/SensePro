"""Evaluate a recorded clip against ground truth.

    python -m eval.run --clip exam.mp4 --truth truth.json --mode exam

Prints the metric table and writes it to CSV. The clip is read once per pass
(presence, proctor ON, proctor OFF) so nothing is held in memory. Use
VISION_BACKEND=insightface for real numbers; the stub only proves plumbing.
"""

from __future__ import annotations

import argparse
import logging
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.store import NoopWriter
from eval.harness import (
    eval_presence,
    eval_proctor,
    iter_clip,
    load_truth,
    print_table,
    report_rows,
    write_csv,
)
from proctor.detector import build_proctor_detector
from proctor.engine import ProctorEngine
from proctor.suppression import GazeSuppressor
from vision.embedding_store import EmbeddingStore
from vision.pipeline import SessionPipeline

NEVER_DOWN_DEG = -1e9  # a threshold no head can reach: the filter-OFF pass


def _pipeline(enrollment: str) -> SessionPipeline:
    path = Path(enrollment)
    store = (
        EmbeddingStore.from_json(path, threshold=settings.cosine_threshold)
        if path.exists()
        else EmbeddingStore(threshold=settings.cosine_threshold)
    )
    return SessionPipeline(
        store=store,
        reid_interval_s=settings.reid_interval_s,
        miss_threshold=settings.miss_threshold,
    )


def _engine(filter_on: bool) -> ProctorEngine:
    return ProctorEngine(
        detector=build_proctor_detector(),
        suppressor=GazeSuppressor(
            window_s=settings.gaze_window_s,
            pitch_down_deg=settings.gaze_pitch_down_deg if filter_on else NEVER_DOWN_DEG,
        ),
        writer=NoopWriter(),  # eval measures, never persists
        session_id="eval",
        session_start=datetime.now(UTC),
        cooldown_s=0.0,  # count every candidate, not the deduped queue
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="eval.run", description=__doc__)
    parser.add_argument("--clip", required=True, help="recorded video file")
    parser.add_argument("--truth", required=True, help="ground-truth JSON")
    parser.add_argument("--mode", choices=("lecture", "exam"), default="lecture")
    parser.add_argument("--enrollment", default=settings.enrollment_json)
    parser.add_argument("--csv", default="eval_report.csv")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING)  # keep the table readable
    truth = load_truth(args.truth)

    presence = eval_presence(iter_clip(args.clip), _pipeline(args.enrollment), truth["present"])
    on = off = None
    if args.mode == "exam":
        on = eval_proctor(iter_clip(args.clip), _pipeline(args.enrollment), _engine(True), truth)
        off = eval_proctor(iter_clip(args.clip), _pipeline(args.enrollment), _engine(False), truth)

    rows = report_rows(presence, on, off)
    print_table(rows)
    write_csv(rows, args.csv)
    print(f"\nwritten: {args.csv}")


if __name__ == "__main__":
    main()
