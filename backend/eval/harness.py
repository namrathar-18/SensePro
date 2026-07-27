"""Honest evaluation harness: recorded clip + ground truth -> numbers.

Reports three things and nothing speculative:
- recognition hit-rate per student: of the frames where ground truth says the
  student is present, in how many did the pipeline agree?
- presence-duration error: |measured PRESENT seconds - ground-truth seconds|.
- proctor false positives with the gaze-down filter ON vs OFF — the number
  that proves (or disproves) the filter. Both passes share every other
  setting; OFF is a suppressor whose threshold nothing can reach.

Ground truth JSON:
    {
      "present": {"<student_id>": [[start_s, end_s], ...], ...},
      "phone_windows": [[start_s, end_s], ...]   // when a phone truly shows
    }
A phone flag inside a phone window counts as a true positive; outside, a
false positive. Proctor passes run with cooldown 0 so the rates count every
candidate, not the deduped review queue.

Nothing here touches the network or persists anything: writers are no-ops,
frames are read, measured, and dropped.
"""

from __future__ import annotations

import csv
import json
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from proctor.engine import ProctorEngine

Frame = tuple[np.ndarray, float]
Windows = list[list[float]]


def iter_clip(path: str) -> Iterator[Frame]:
    """Every frame of a recorded clip with ts = frame_index / fps. Recorded
    sources iterate exhaustively; live sources (WS, RTSP) are latest-wins —
    the pipeline sees (frame, ts) either way (ADR 0008)."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"cannot open clip: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 20.0
    index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                return
            yield frame, index / fps
            index += 1
    finally:
        cap.release()


def load_truth(path: str) -> dict:
    truth = json.loads(Path(path).read_text(encoding="utf-8"))
    truth.setdefault("present", {})
    truth.setdefault("phone_windows", [])
    return truth


def _in_windows(ts: float, windows: Windows) -> bool:
    return any(a <= ts <= b for a, b in windows)


def _total(windows: Windows) -> float:
    return sum(b - a for a, b in windows)


@dataclass
class PresenceResult:
    hit_rate: dict[str, float]
    truth_s: dict[str, float]
    measured_s: dict[str, float]

    def error_s(self, student: str) -> float:
        return abs(self.measured_s[student] - self.truth_s[student])


def eval_presence(frames: Iterable[Frame], pipeline, present_truth: dict) -> PresenceResult:
    """One pass: recognition hit-rate against truth windows and measured
    PRESENT time integrated over frame gaps."""
    hits = dict.fromkeys(present_truth, 0)
    truth_frames = dict.fromkeys(present_truth, 0)
    measured = dict.fromkeys(present_truth, 0.0)
    prev_ts: float | None = None
    prev_present: set[str] = set()
    for frame, ts in frames:
        if prev_ts is not None:  # credit the gap to the previous frame's state
            dt = ts - prev_ts
            for student in prev_present:
                if student in measured:
                    measured[student] += dt
        result = pipeline.process_frame(frame, ts)
        prev_present = set(result["present"])
        prev_ts = ts
        for student, windows in present_truth.items():
            if _in_windows(ts, windows):
                truth_frames[student] += 1
                if student in prev_present:
                    hits[student] += 1
    return PresenceResult(
        hit_rate={s: hits[s] / truth_frames[s] if truth_frames[s] else 0.0 for s in present_truth},
        truth_s={s: _total(w) for s, w in present_truth.items()},
        measured_s=measured,
    )


@dataclass
class ProctorResult:
    tp: int
    fp: int


def eval_proctor(
    frames: Iterable[Frame], pipeline, engine: ProctorEngine, truth: dict
) -> ProctorResult:
    """One pass: every phone flag is judged against the truth windows."""
    tp = fp = 0
    for frame, ts in frames:
        pipeline.process_frame(frame, ts)
        for flag in engine.observe(frame, pipeline.last_tracks, ts):
            if flag.flag_type != "phone":
                continue
            if _in_windows(ts, truth["phone_windows"]):
                tp += 1
            else:
                fp += 1
    return ProctorResult(tp=tp, fp=fp)


def fp_reduction(off: ProctorResult, on: ProctorResult) -> float:
    return (off.fp - on.fp) / off.fp if off.fp else 0.0


def report_rows(
    presence: PresenceResult, on: ProctorResult | None, off: ProctorResult | None
) -> list[list[str]]:
    """Flat rows for both the console table and the CSV."""
    rows = [["metric", "subject", "value"]]
    for student in sorted(presence.hit_rate):
        rows.append(["recognition_hit_rate", student, f"{presence.hit_rate[student]:.3f}"])
        rows.append(
            ["presence_duration_error_min", student, f"{presence.error_s(student) / 60:.2f}"]
        )
    if on is not None and off is not None:
        rows.append(["proctor_tp_filter_on", "-", str(on.tp)])
        rows.append(["proctor_fp_filter_on", "-", str(on.fp)])
        rows.append(["proctor_tp_filter_off", "-", str(off.tp)])
        rows.append(["proctor_fp_filter_off", "-", str(off.fp)])
        rows.append(["proctor_fp_reduction", "-", f"{fp_reduction(off, on):.1%}"])
    return rows


def print_table(rows: list[list[str]]) -> None:
    widths = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    for i, row in enumerate(rows):
        print("  ".join(cell.ljust(widths[c]) for c, cell in enumerate(row)))
        if i == 0:
            print("  ".join("-" * w for w in widths))


def write_csv(rows: list[list[str]], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerows(rows)
