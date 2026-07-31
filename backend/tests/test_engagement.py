"""VNEI engagement layer, offline: zone bands, the vnei/coverage arithmetic,
window rollover, the k>=5 suppression floor, and the hard invariant that no
engagement record carries any student or track identifier. Signals are
transient and derived from landmarks/detections the pipeline already has."""

import json
from datetime import UTC, datetime

from engagement.signals import SignalExtractor, TrackSignals
from engagement.vnei import ZoneAggregator
from proctor.detector import ObjectDetection
from vision.types import Detection, Track

SESSION_START = datetime(2026, 7, 17, 9, 0, tzinfo=UTC)
FRAME_H = 240


def _track(tid: int, y_centre: int = 200, eyes: str | None = None) -> Track:
    """40x40 box centred at y_centre; eyes place the landmark line for pitch."""
    x1, y1 = 20 + 50 * tid, y_centre - 20
    landmarks = []
    if eyes == "level":  # 40% down the box -> pitch 0
        landmarks = [(x1 + 5.0, y1 + 16.0), (x1 + 35.0, y1 + 16.0)]
    elif eyes == "down":  # 60% down the box -> pitch -40 (past the -35 band)
        landmarks = [(x1 + 5.0, y1 + 24.0), (x1 + 35.0, y1 + 24.0)]
    det = Detection(x1, y1, x1 + 40, y1 + 40, score=0.99, landmarks=landmarks)
    return Track(track_id=tid, det=det, student_id=f"student-{tid}")


def _sig(attending: bool | None = True) -> TrackSignals:
    head_down = None if attending is None else not attending
    return TrackSignals(
        attending=attending,
        head_down=head_down,
        looking_away=None if attending is None else False,
        phone_nearby=False,
        still=None,
    )


class FakeAggWriter:
    def __init__(self) -> None:
        self.rows = []

    def create_zone_aggregate(self, row) -> None:
        self.rows.append(row)


def _aggregator(writer: FakeAggWriter, enrolled: dict[str, int] | None = None) -> ZoneAggregator:
    return ZoneAggregator(
        session_id="sess-vnei",
        writer=writer,
        session_start=SESSION_START,
        enrolled_by_zone=enrolled or {"front": 10, "mid": 20, "back": 20},
        window_s=60.0,
    )


def test_zones_are_fixed_frame_bands() -> None:
    agg = _aggregator(FakeAggWriter())
    assert agg.zone_of(_track(1, y_centre=200), FRAME_H) == "front"  # lower = nearer
    assert agg.zone_of(_track(1, y_centre=120), FRAME_H) == "mid"
    assert agg.zone_of(_track(1, y_centre=40), FRAME_H) == "back"


def test_vnei_and_coverage_arithmetic() -> None:
    writer = FakeAggWriter()
    agg = _aggregator(writer)
    obs = [(_track(t), _sig(attending=t != 5)) for t in range(1, 6)]  # 4 of 5 attending
    assert agg.observe(obs, FRAME_H, rel_ts=0.0) == []  # window still open
    rows = agg.flush()
    assert writer.rows == rows and len(rows) == 1
    row = rows[0]
    assert row.zone == "front"
    assert row.n_tracked == 5
    assert row.vnei == 0.8  # attending / observations of visible tracks
    assert row.coverage == 0.5  # 5 tracked of 10 enrolled in the zone
    assert row.signals == {"phone_rate": 0.0, "head_down_rate": 0.2, "still_rate": 0.0}


def test_zone_below_k_floor_is_suppressed() -> None:
    writer = FakeAggWriter()
    agg = _aggregator(writer)
    agg.observe([(_track(t), _sig()) for t in range(1, 5)], FRAME_H, rel_ts=0.0)  # only 4
    assert agg.flush() == [] and writer.rows == []
    agg.observe([(_track(t), _sig()) for t in range(1, 6)], FRAME_H, rel_ts=0.0)  # 5 -> emits
    assert len(agg.flush()) == 1


def test_window_rollover_emits_closed_window() -> None:
    writer = FakeAggWriter()
    agg = _aggregator(writer)
    obs = [(_track(t), _sig()) for t in range(1, 6)]
    assert agg.observe(obs, FRAME_H, rel_ts=0.0) == []
    rolled = agg.observe(obs, FRAME_H, rel_ts=61.0)  # crosses the 60s boundary
    assert len(rolled) == 1 and rolled[0].window_start == SESSION_START
    assert len(agg.flush()) == 1  # the second window has its own row


def test_no_student_identifier_on_any_engagement_record() -> None:
    writer = FakeAggWriter()
    agg = _aggregator(writer)
    agg.observe([(_track(t), _sig()) for t in range(1, 6)], FRAME_H, rel_ts=0.0)
    payload = agg.flush()[0].payload()
    assert set(payload) == {
        "id",
        "session_id",
        "window_start",
        "window_s",
        "zone",
        "n_tracked",
        "enrolled_in_zone",
        "coverage",
        "vnei",
        "signals",
    }
    assert "student" not in json.dumps(payload)  # no identifier, in any spelling


def test_signal_extractor_attention_from_landmarks() -> None:
    ext = SignalExtractor()
    sigs = ext.extract([_track(1, eyes="level"), _track(2, eyes="down"), _track(3)], [], (240, 320))
    assert sigs[1].attending is True and sigs[1].head_down is False
    assert sigs[2].attending is False and sigs[2].head_down is True
    assert sigs[3].attending is None and sigs[3].head_down is None  # stub: can't tell


def test_signal_extractor_phone_nearby() -> None:
    track = _track(1, y_centre=110)  # box (70,90)-(110,130)
    phone = ObjectDetection("cell phone", (120, 130, 150, 160), 0.9)  # within reach
    sigs = SignalExtractor().extract([track], [phone], (240, 320))
    assert sigs[1].phone_nearby is True
    assert SignalExtractor().extract([track], [], (240, 320))[1].phone_nearby is False


def test_signal_extractor_stillness_across_frames() -> None:
    ext = SignalExtractor()  # still limit: 2% of 400px diagonal = 8px
    first = ext.extract([_track(1, y_centre=200)], [], (240, 320))
    assert first[1].still is None  # no prior position yet
    same = ext.extract([_track(1, y_centre=200)], [], (240, 320))
    assert same[1].still is True
    moved = ext.extract([_track(1, y_centre=180)], [], (240, 320))  # 20px jump
    assert moved[1].still is False
