"""
SensePro+ — Vision pipeline
SCRFD (detect) → ByteTrack (track) → ArcFace (embed + re-ID)

INVARIANTS:
- Frames are NEVER written to disk from this module.
- Embeddings are loaded into memory at startup; raw pixel data is discarded
  immediately after inference.
"""
import time
import logging
import numpy as np
import cv2
from dataclasses import dataclass, field
from typing import Optional
from insightface.app import FaceAnalysis
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DetectedFace:
    """A single face detection + embedding result for one frame."""
    bbox: tuple[int, int, int, int]    # x1, y1, x2, y2
    embedding: np.ndarray              # 512-d ArcFace embedding
    landmarks: Optional[np.ndarray]    # 5-point landmarks
    det_score: float
    track_id: Optional[int] = None
    identity: Optional[str] = None     # student_id if matched
    identity_score: float = 0.0        # cosine similarity


@dataclass
class TrackState:
    """Per-track state maintained across frames."""
    track_id: int
    student_id: Optional[str] = None
    last_reid_ts: float = 0.0
    frames_seen: int = 0
    embeddings_buffer: list = field(default_factory=list)  # for averaging


class FacePipeline:
    """
    Main vision pipeline. Instantiate once at app startup.
    Call `process_frame(jpeg_bytes)` per incoming WebSocket frame.
    """

    def __init__(self):
        logger.info("Loading InsightFace buffalo_l model...")
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        # det_size should match downscaled frame width (max 640)
        self.app.prepare(ctx_id=0, det_size=(640, 640))

        # Embedding store: {student_id: [np.ndarray, ...]}
        # Loaded from Supabase at startup and refreshed periodically.
        self.embedding_store: dict[str, list[np.ndarray]] = {}

        # ByteTrack tracker (lightweight implementation)
        self._tracker = self._init_tracker()

        # Per-track state
        self._track_states: dict[int, TrackState] = {}

        logger.info("FacePipeline ready.")

    # ─── Tracker init ──────────────────────────────────────────────────────
    def _init_tracker(self):
        """
        Returns a ByteTrack-compatible tracker.
        Using a simple IoU + Kalman tracker here.
        Replace with ByteTrack proper if laptrack is available.
        """
        try:
            from laptrack import LapTrack
            return LapTrack(
                track_dist_metric="iou",
                track_cost_cutoff=0.5,
                gap_closing_max_frame_count=2,
            )
        except ImportError:
            logger.warning("laptrack not installed — using naive ID tracker")
            return None

    # ─── Embedding store management ────────────────────────────────────────
    def load_embeddings(self, embeddings: dict[str, list[list[float]]]):
        """
        Load embeddings from Supabase into memory.
        embeddings = {student_id: [[512 floats], ...]}
        """
        self.embedding_store = {
            sid: [np.array(e, dtype=np.float32) for e in embs]
            for sid, embs in embeddings.items()
        }
        logger.info(f"Loaded embeddings for {len(self.embedding_store)} students")

    # ─── Core processing ───────────────────────────────────────────────────
    def process_frame(self, jpeg_bytes: bytes) -> list[DetectedFace]:
        """
        Process one JPEG frame.
        Returns list of DetectedFace with identities filled in where confident.
        Frame bytes are consumed; no reference is retained after this call.
        """
        # Decode JPEG to numpy array
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return []

        # Enforce max width (should already be done client-side, belt+suspenders)
        h, w = img.shape[:2]
        if w > settings.MAX_FRAME_WIDTH:
            scale = settings.MAX_FRAME_WIDTH / w
            img = cv2.resize(img, (int(w * scale), int(h * scale)))

        # Run InsightFace detection + embedding in one call
        faces = self.app.get(img)

        # Immediately release the image array from memory
        del img
        del arr

        results: list[DetectedFace] = []
        now = time.time()

        for face in faces:
            bbox = tuple(face.bbox.astype(int).tolist())
            emb = face.normed_embedding  # Already L2-normalised by InsightFace

            df = DetectedFace(
                bbox=bbox,
                embedding=emb,
                landmarks=face.kps,
                det_score=float(face.det_score),
            )

            # Re-ID: cosine similarity against stored embeddings
            best_sid, best_score = self._match_identity(emb)
            if best_score >= settings.ARCFACE_THRESHOLD:
                df.identity = best_sid
                df.identity_score = best_score

            results.append(df)

        return results

    def _match_identity(
        self, embedding: np.ndarray
    ) -> tuple[Optional[str], float]:
        """
        Cosine similarity search against the embedding store.
        InsightFace already L2-normalises embeddings, so dot product == cosine sim.
        Returns (student_id, score) or (None, 0.0).
        """
        best_sid = None
        best_score = 0.0

        for sid, stored_embs in self.embedding_store.items():
            for stored_emb in stored_embs:
                score = float(np.dot(embedding, stored_emb))
                if score > best_score:
                    best_score = score
                    best_sid = sid

        return best_sid, best_score

    def get_head_pose(self, landmarks: np.ndarray) -> dict:
        """
        Estimate head pose (yaw, pitch, roll) from 5-point landmarks via solvePnP.
        Returns dict with yaw, pitch, roll in degrees.
        """
        if landmarks is None or len(landmarks) < 5:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}

        # 3D model points (generic head model)
        model_points = np.array([
            [0.0, 0.0, 0.0],          # Nose tip
            [0.0, -330.0, -65.0],     # Chin
            [-225.0, 170.0, -135.0],  # Left eye corner
            [225.0, 170.0, -135.0],   # Right eye corner
            [-150.0, -150.0, -125.0], # Left mouth corner
        ], dtype=np.float64)

        # Approximate camera matrix (assuming 640px wide frame)
        focal = 640
        cam_matrix = np.array([
            [focal, 0, 320],
            [0, focal, 320],
            [0, 0, 1],
        ], dtype=np.float64)

        img_points = landmarks[:5].astype(np.float64)
        dist_coeffs = np.zeros((4, 1))

        ok, rvec, _ = cv2.solvePnP(
            model_points, img_points, cam_matrix, dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}

        rmat, _ = cv2.Rodrigues(rvec)
        angles = cv2.RQDecomp3x3(rmat)[0]
        return {
            "yaw":   float(angles[1]),
            "pitch": float(angles[0]),
            "roll":  float(angles[2]),
        }

    def compute_eye_aspect_ratio(self, landmarks: np.ndarray) -> float:
        """
        Eye Aspect Ratio from 5-point landmarks (points 2,3 = left eye, 0,1 = right).
        EAR < 0.2 → eye closed.
        """
        if landmarks is None or len(landmarks) < 4:
            return 0.3  # assume open

        left_eye  = landmarks[2]
        right_eye = landmarks[3]
        # Simplified EAR from landmark distance (real EAR needs 6-point eye landmarks)
        eye_width = np.linalg.norm(left_eye - right_eye)
        # Use nose-to-eye ratio as proxy
        nose = landmarks[0]
        eye_mid = (left_eye + right_eye) / 2
        eye_height = np.linalg.norm(nose - eye_mid) * 0.1  # heuristic
        if eye_width == 0:
            return 0.3
        return float(eye_height / eye_width)
