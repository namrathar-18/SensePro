from vision.tracker import IoUTracker
from vision.types import Detection


def test_stable_id_across_frames() -> None:
    tk = IoUTracker()
    d1 = Detection(0, 0, 10, 10, 0.9)
    t = tk.update([d1])
    tid = t[0].track_id
    # slightly moved box -> same track id
    t2 = tk.update([Detection(1, 1, 11, 11, 0.9)])
    assert t2[0].track_id == tid
    assert t2[0].age == 2
