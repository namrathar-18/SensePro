"""
SensePro+ — Proctor Service

CRITICAL INVARIANTS:
  1. Every flag is a human REVIEW item — never an auto-penalty.
  2. Gaze-down suppression: students with head pitch > GAZE_DOWN_ANGLE_DEG
     (looking down at exam paper) are NEVER flagged for sustained gaze deviation.
  3. auto_action is always NULL (enforced in DB schema too).

Detection pipeline in exam mode:
  - YOLOv8n detects 'cell phone' and extra 'person' (COCO classes)
  - Head pose: sustained downward gaze is suppressed; lateral deviation flags
  - Phone detection: immediate flag to review queue
  - Extra person: immediate flag to review queue
"""
import time
import logging
from dataclasses import dataclass, field
from typing import Optional
from ultralytics import YOLO
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# COCO class IDs relevant to proctoring
COCO_PHONE  = 67   # 'cell phone'
COCO_PERSON = 0    # 'person'


@dataclass
class ProctorFlag:
    flag_type: str        # 'phone_detected' | 'extra_person' | 'gaze_sustained'
    confidence: float
    zone: Optional[str] = None
    bbox: Optional[tuple] = None
    detected_at: float = field(default_factory=time.time)
    suppressed: bool = False   # True = gaze-down suppression applied


@dataclass
class GazeTracker:
    """Tracks how long a person has been looking away (not down)."""
    student_id: str
    deviated_since: Optional[float] = None

    def update(self, pitch: float, yaw: float, ts: float) -> bool:
        """
        Returns True if this is a flaggable sustained gaze deviation.
        Suppresses if pitch indicates writing (looking down at paper).
        """
        looking_down = pitch < -settings.GAZE_DOWN_ANGLE_DEG
        looking_away = abs(yaw) > 30  # looking significantly sideways

        if looking_down:
            # Writing suppression — reset tracker
            self.deviated_since = None
            return False

        if looking_away and not looking_down:
            if self.deviated_since is None:
                self.deviated_since = ts
            elif ts - self.deviated_since >= settings.GAZE_SUSTAINED_S:
                return True  # Flaggable
        else:
            self.deviated_since = None  # Reset on normal gaze

        return False


class ProctorService:
    """
    YOLOv8n-based proctor service.
    Call `process_frame(jpeg_bytes, face_results)` in exam mode.
    Flags accumulate in `pending_flags` — the API drains these into Supabase.
    """

    def __init__(self):
        logger.info("Loading YOLOv8n model...")
        self.yolo = YOLO("yolov8n.pt")  # Downloads automatically on first run
        self._gaze_trackers: dict[str, GazeTracker] = {}
        self.pending_flags: list[ProctorFlag] = []
        logger.info("ProctorService ready.")

    def process_frame(
        self,
        img,                          # numpy array (already decoded by pipeline)
        face_results: list,           # DetectedFace list from FacePipeline
        head_poses: dict[str, dict],  # {student_id: {yaw, pitch, roll}}
        frame_width: int,
        frame_height: int,
    ) -> list[ProctorFlag]:
        """
        Run YOLO detection + gaze analysis on one frame.
        Returns new flags (unsuppressed only) without mutating self.pending_flags
        — caller appends to self.pending_flags or sends to DB.

        INVARIANT: img is not stored; only bbox coordinates and confidence are retained.
        """
        flags: list[ProctorFlag] = []
        now = time.time()

        # ─── YOLOv8n object detection ──────────────────────────────────────
        yolo_results = self.yolo(img, verbose=False)[0]

        phone_count  = 0
        person_count = 0

        for box in yolo_results.boxes:
            cls_id = int(box.cls[0])
            conf   = float(box.conf[0])
            bbox   = tuple(box.xyxy[0].tolist())

            if cls_id == COCO_PHONE and conf > 0.5:
                phone_count += 1
                flags.append(ProctorFlag(
                    flag_type="phone_detected",
                    confidence=conf,
                    bbox=bbox,
                    zone=_bbox_to_zone(bbox, frame_width, frame_height),
                ))

            elif cls_id == COCO_PERSON and conf > 0.6:
                person_count += 1

        # Extra person = someone other than expected students
        expected_students = len(face_results)
        if person_count > expected_students + 1:  # +1 tolerance
            flags.append(ProctorFlag(
                flag_type="extra_person",
                confidence=0.8,
                zone="unknown",
            ))

        # ─── Gaze deviation tracking ───────────────────────────────────────
        for face in face_results:
            if face.identity is None:
                continue

            pose = head_poses.get(face.identity, {})
            yaw   = pose.get("yaw", 0.0)
            pitch = pose.get("pitch", 0.0)

            tracker = self._gaze_trackers.setdefault(
                face.identity, GazeTracker(student_id=face.identity)
            )

            if tracker.update(pitch, yaw, now):
                flags.append(ProctorFlag(
                    flag_type="gaze_sustained",
                    confidence=0.7,
                    zone=_bbox_to_zone(face.bbox, frame_width, frame_height),
                ))

        return flags

    def reset_session(self):
        """Clear state between sessions."""
        self._gaze_trackers.clear()
        self.pending_flags.clear()

    def get_false_positive_rate(self) -> dict:
        """
        Count suppressed vs total gaze flags.
        Used to generate the before/after FPR metric for the viva.
        """
        total    = sum(1 for f in self.pending_flags if f.flag_type == "gaze_sustained")
        suppressed = sum(1 for f in self.pending_flags if f.suppressed)
        return {
            "total_flags": total,
            "suppressed":  suppressed,
            "fpr_reduction": round(suppressed / total, 3) if total > 0 else 0.0,
        }


def _bbox_to_zone(bbox: tuple, frame_w: int, frame_h: int) -> str:
    """Map a YOLO bbox to a room zone string."""
    x1, y1, x2, y2 = bbox
    cy = (y1 + y2) / 2
    y_ratio = cy / frame_h
    if y_ratio < 0.33:
        return "back"
    elif y_ratio < 0.66:
        return "middle"
    return "front"
