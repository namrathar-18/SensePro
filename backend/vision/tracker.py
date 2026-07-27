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


class IoUTracker:
    def __init__(self, iou_thresh: float = 0.3, max_misses: int = 30) -> None:
        self.iou_thresh = iou_thresh
        self.max_misses = max_misses
        self._tracks: dict[int, Track] = {}
        self._next_id = 1

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
