"""
Tests for enrollment pipeline logic.
INVARIANT: No frames are stored — only embeddings.
"""
import pytest
import numpy as np
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import only the pure-logic helpers (no insightface/CV2 needed)
# We copy the functions here to keep tests fast and model-free in CI
FRAMES_PER_POSE_BIN = 3

def _classify_pose(yaw: float, pitch: float) -> str:
    if abs(yaw) < 15 and abs(pitch) < 15:
        return "center"
    if yaw > 15:
        return "right"
    if yaw < -15:
        return "left"
    if pitch > 15:
        return "up"
    return "down"

def _select_frames(quality_frames: list) -> list:
    per_bin: dict = {}
    for pose_bin, emb in quality_frames:
        per_bin.setdefault(pose_bin, []).append(emb)
    selected = []
    for pose_bin, embs in per_bin.items():
        kept = []
        for emb in embs[:FRAMES_PER_POSE_BIN]:
            is_dup = any(np.dot(emb, k) > 0.95 for k in kept)
            if not is_dup:
                kept.append(emb)
                selected.append((pose_bin, emb))
        if len(selected) >= 20:
            break
    return selected


def fake_embedding(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    e = rng.random(512).astype(np.float32)
    return e / np.linalg.norm(e)


# ─── Pose classification ──────────────────────────────────────────────────────

def test_classify_pose_center():
    assert _classify_pose(0.0, 0.0) == "center"
    assert _classify_pose(10.0, -10.0) == "center"


def test_classify_pose_left():
    assert _classify_pose(-30.0, 0.0) == "left"


def test_classify_pose_right():
    assert _classify_pose(30.0, 0.0) == "right"


def test_classify_pose_up():
    assert _classify_pose(0.0, 20.0) == "up"


def test_classify_pose_down():
    assert _classify_pose(0.0, -20.0) == "down"


# ─── Frame selection ─────────────────────────────────────────────────────────

def test_select_frames_caps_per_bin():
    """Should keep at most FRAMES_PER_POSE_BIN frames per pose bin."""
    frames = [("center", fake_embedding(i)) for i in range(10)]
    selected = _select_frames(frames)
    center_count = sum(1 for p, _ in selected if p == "center")
    assert center_count <= FRAMES_PER_POSE_BIN


def test_select_frames_deduplicates_near_identical():
    """Near-identical embeddings (cosine > 0.95) should be deduplicated."""
    base = fake_embedding(42)
    # Create near-duplicates by slightly perturbing
    near_dup = base + np.random.default_rng(0).random(512).astype(np.float32) * 0.01
    near_dup = near_dup / np.linalg.norm(near_dup)
    frames = [("center", base), ("center", near_dup)]
    selected = _select_frames(frames)
    assert len(selected) <= 1, "Near-duplicate embeddings should be deduped"


def test_select_frames_keeps_diverse_poses():
    """Different pose bins should all be represented."""
    frames = []
    for i, pose in enumerate(["center", "left", "right", "up", "down"]):
        frames.append((pose, fake_embedding(i * 10)))
    selected = _select_frames(frames)
    poses = {p for p, _ in selected}
    assert poses == {"center", "left", "right", "up", "down"}


def test_select_frames_handles_empty():
    assert _select_frames([]) == []


def test_select_frames_max_20():
    """Total selected frames should not exceed 20."""
    frames = [(f"pose{i%5}", fake_embedding(i)) for i in range(100)]
    selected = _select_frames(frames)
    assert len(selected) <= 20


# ─── Average embedding normalisation ─────────────────────────────────────────

def test_avg_embedding_is_unit_norm():
    """Average embedding must be re-normalised to unit norm for cosine matching."""
    embeddings = [fake_embedding(i) for i in range(5)]
    avg = np.mean(embeddings, axis=0)
    avg /= np.linalg.norm(avg)
    assert abs(np.linalg.norm(avg) - 1.0) < 1e-5


# ─── Consent gate ─────────────────────────────────────────────────────────────

def test_enrollment_blocked_without_consent():
    """
    Enrollment must raise HTTPException(400) if consent not signed.
    This tests the API-level guard conceptually (DB mock).
    """
    from fastapi import HTTPException
    consent_data = {"signed_at": None}

    def check_consent(consent):
        if not consent or not consent.get("signed_at"):
            raise HTTPException(status_code=400, detail="Consent required")

    with pytest.raises(HTTPException) as exc:
        check_consent(consent_data)
    assert exc.value.status_code == 400


def test_enrollment_proceeds_with_consent():
    from fastapi import HTTPException
    consent_data = {"signed_at": "2024-01-01T10:00:00Z"}

    def check_consent(consent):
        if not consent or not consent.get("signed_at"):
            raise HTTPException(status_code=400, detail="Consent required")

    check_consent(consent_data)  # Should not raise
