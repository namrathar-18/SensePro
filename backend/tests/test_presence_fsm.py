from presence.fsm import ABSENT, PRESENT, UNVERIFIED, PresenceFSM


def test_first_sighting_present() -> None:
    fsm = PresenceFSM()
    tr = fsm.observe({"s1"}, {"s1", "s2"}, ts=0)
    assert ("s1", PRESENT) in tr
    assert fsm.state_of("s1") == PRESENT
    assert fsm.state_of("s2") == ABSENT


def test_misses_to_absent() -> None:
    fsm = PresenceFSM(miss_threshold=3)
    fsm.observe({"s1"}, {"s1"}, ts=0)
    fsm.observe(set(), {"s1"}, ts=30)
    assert fsm.state_of("s1") == UNVERIFIED
    fsm.observe(set(), {"s1"}, ts=60)
    fsm.observe(set(), {"s1"}, ts=90)
    assert fsm.state_of("s1") == ABSENT


def test_duration_accounting() -> None:
    fsm = PresenceFSM(miss_threshold=3)
    fsm.observe({"s1"}, {"s1"}, ts=0)
    fsm.observe(set(), {"s1"}, ts=60)
    fsm.observe({"s1"}, {"s1"}, ts=90)
    fsm.end_session(ts=150)
    assert fsm.present_seconds("s1") == 120.0
