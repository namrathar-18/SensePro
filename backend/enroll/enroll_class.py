"""Batch-enrol an entire class from per-student photo folders.

    python -m enroll.enroll_class --photos-dir "D:/path/to/photos" --out enrollments.json

Folder layout (one folder per student, named by register number):

    photos/
      2547201/  DSC09028.JPG  DSC09029.JPG
      2547203/  ...
      ...

Each folder's images are run through the SAME quality-gate + embed pipeline as
the single-student CLI (no training — embeddings only). The source photos are
NEVER modified or deleted (unlike the single-student CLI's default). Output is
enrollments.json keyed by register number, ready for the capture pipeline.

Run with the real face backend so recognition works on real faces:

    VISION_BACKEND=insightface python -m enroll.enroll_class --photos-dir ...

(Install it first: pip install -e '.[insightface]'. The stub backend only
recognises solid-colour cards and will not enrol real photographs.)
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from enroll.pipeline import Enroller, frames_from_dir


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        description="Batch enrolment for a class (no training; embeddings only)."
    )
    ap.add_argument(
        "--photos-dir",
        required=True,
        help="directory containing one sub-folder per student, named by register number",
    )
    ap.add_argument("--out", default="enrollments.json")
    ap.add_argument(
        "--roster",
        default="data/roster.json",
        help="reg_no -> name map, used only to warn about unknown/missing students",
    )
    ap.add_argument(
        "--no-degrade",
        dest="degrade",
        action="store_false",
        help="disable board-camera degrade augmentation (default: on)",
    )
    args = ap.parse_args(argv)

    photos_dir = Path(args.photos_dir)
    if not photos_dir.is_dir():
        raise SystemExit(f"--photos-dir not found: {photos_dir}")

    roster: dict[str, str] = {}
    roster_path = Path(args.roster)
    if roster_path.exists():
        roster = json.loads(roster_path.read_text(encoding="utf-8"))

    out_path = Path(args.out)
    data: dict[str, list] = json.loads(out_path.read_text()) if out_path.exists() else {}

    enroller = Enroller(degrade=args.degrade)
    folders = sorted(p for p in photos_dir.iterdir() if p.is_dir())
    if not folders:
        raise SystemExit(f"No student folders under {photos_dir}")

    enrolled, empty, no_quality = 0, [], []
    for folder in folders:
        reg_no = folder.name
        images = frames_from_dir(str(folder))
        if not images:
            empty.append(reg_no)
            print(f"  [skip] {reg_no}: no images in folder")
            continue
        embeddings = enroller.enroll_frames(images)
        if not embeddings:
            no_quality.append(reg_no)
            print(f"  [warn] {reg_no}: no frame passed the quality gate")
            continue
        data[reg_no] = embeddings
        name = roster.get(reg_no, "?")
        enrolled += 1
        print(f"  [ok]   {reg_no} {name}: {len(embeddings)} embeddings")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data))

    print()
    print(f"Enrolled {enrolled}/{len(folders)} students -> {out_path}")
    if empty:
        print(f"Empty folders ({len(empty)}): {', '.join(empty)}")
    if no_quality:
        print(f"No quality frames ({len(no_quality)}): {', '.join(no_quality)}")
    unknown = sorted(set(data) - set(roster)) if roster else []
    if unknown:
        print(f"Enrolled but not in roster.json ({len(unknown)}): {', '.join(unknown)}")
    if roster:
        missing = sorted(set(roster) - set(data))
        if missing:
            print(f"In roster.json but not enrolled ({len(missing)}): {', '.join(missing)}")
    print("Source photos left untouched (this tool never deletes).")
    if os.getenv("VISION_BACKEND", "stub").lower() != "insightface":
        print(
            "\nNOTE: VISION_BACKEND is not 'insightface' — this run used the stub "
            "backend, which cannot enrol real photos. Re-run with "
            "VISION_BACKEND=insightface for real recognition."
        )


if __name__ == "__main__":
    main()
