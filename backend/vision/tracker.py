"""Lightweight IoU tracker — keeps stable track IDs across frames so that
re-identification runs per TRACK on an interval, never per frame.

This is the integration seam for ByteTrack: swap `update()` internals for
ByteTrack in production; the pipeline contract stays identical.
"""

from __future__ import annotations

from vision.types import Detection, Track


def _iou(a: Detection, b: Detection) -> float:
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = (a.x2 - a.x1) * (a.y2 - a.y1)
    area_b = (b.x2 - b.x1) * (b.y2 - b.y1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _centre_shift(a: Detection, b: Detection) -> float:
    ax, ay = (a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2
    bx, by = (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _jump_limit(a: Detection) -> float:
    """How far a face may travel between sampled frames and still be the same
    person: one box width. Scale-free, so it holds for near and far faces."""
    return max(a.x2 - a.x1, 1.0)


class IoUTracker:
    def __init__(self, iou_thresh: float = 0.3, max_misses: int = 4) -> None:
        self.iou_thresh = iou_thresh
        # Frames a track survives unmatched. The capture path samples at 1-2 fps,
        # so the old default of 30 kept a face "alive" for ~15-30 s after it left
        # frame — long enough that panning to a new row still carried the
        # previous row's tracks.
        self.max_misses = max_misses
        self._tracks: dict[int, Track] = {}
        self._next_id = 1

    def reset(self) -> None:
        """Drop every track. Called when the camera moves to a new part of the
        room: the faces on screen are different people, so their identities must
        be resolved fresh rather than inherited by IoU from whoever previously
        occupied that part of the frame."""
        self._tracks.clear()

    def update(self, dets: list[Detection]) -> list[Track]:
        assigned: set[int] = set()
        for det in dets:
            best_id, best_iou = None, self.iou_thresh
            for tid, tr in self._tracks.items():
                if tid in assigned:
                    continue
                i = _iou(det, tr.det)
                if i >= best_iou:
                    best_id, best_iou = tid, i
            if best_id is None:
                tr = Track(track_id=self._next_id, det=det, age=1, misses=0)
                self._tracks[self._next_id] = tr
                assigned.add(self._next_id)
                self._next_id += 1
            else:
                tr = self._tracks[best_id]
                # A box that jumps more than its own width between frames is not
                # the same face drifting — it is a different person landing where
                # the last one was (common mid-pan). Drop the inherited identity
                # so the pipeline re-identifies this face instead of labelling it
                # with the previous student's name.
                if tr.student_id is not None and _centre_shift(tr.det, det) > _jump_limit(tr.det):
                    tr.student_id = None
                    tr.match_score = 0.0
                    tr.last_reid_ts = None
                tr.det = det
                tr.age += 1
                tr.misses = 0
                assigned.add(best_id)

        for tid, tr in list(self._tracks.items()):
            if tid not in assigned:
                tr.misses += 1
                if tr.misses > self.max_misses:
                    del self._tracks[tid]
        return [t for t in self._tracks.values() if t.misses == 0]
