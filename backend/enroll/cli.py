"""Enrollment CLI.

  sensepro-enroll --student-id s1 --video clip.mp4 --out enrollments.json
  sensepro-enroll --student-id s1 --frames-dir ./frames --out enrollments.json

Appends the student's embeddings to the JSON (creating it if absent), then
deletes the source frames/video unless --keep is given (DPDP data minimisation).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from enroll.pipeline import Enroller, frames_from_dir, frames_from_video


def main() -> None:
    ap = argparse.ArgumentParser(description="SensePro+ enrollment (no training; embeddings only)")
    ap.add_argument("--student-id", required=True)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--video")
    src.add_argument("--frames-dir")
    ap.add_argument("--out", default="enrollments.json")
    ap.add_argument("--fps", type=float, default=5.0)
    ap.add_argument("--keep", action="store_true", help="keep raw frames/video (default: delete)")
    ap.add_argument(
        "--no-degrade",
        dest="degrade",
        action="store_false",
        help="disable board-camera degrade augmentation (default: on)",
    )
    args = ap.parse_args()

    frames = (
        frames_from_video(args.video, args.fps) if args.video else frames_from_dir(args.frames_dir)
    )
    if not frames:
        raise SystemExit("No frames read from source.")

    embeddings = Enroller(degrade=args.degrade).enroll_frames(frames)
    if not embeddings:
        raise SystemExit(
            "No quality frames passed the gate. Re-capture with better light / framing."
        )

    out = Path(args.out)
    data = json.loads(out.read_text()) if out.exists() else {}
    data[args.student_id] = embeddings
    out.write_text(json.dumps(data))
    print(f"Enrolled {args.student_id}: {len(embeddings)} embeddings -> {out}")

    if not args.keep:
        if args.video and os.path.exists(args.video):
            os.remove(args.video)
        if args.frames_dir and os.path.isdir(args.frames_dir):
            import shutil

            shutil.rmtree(args.frames_dir)
        print("Raw source deleted (data minimisation). Use --keep to retain.")


if __name__ == "__main__":
    main()
