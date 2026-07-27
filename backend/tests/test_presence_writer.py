"""Presence write-path logic — fully offline (no network, no Supabase).

The invariant under test: a state change closes the student's open interval
(same row id, ended_at set) and opens exactly one new row — never a duplicate
insert of the closed interval.
"""

from datetime import UTC, datetime

from app.store import NoopWriter, PresenceInterval, SessionRecorder, build_writer

START = datetime(2026, 7, 14, 9, 0, 0, tzinfo=UTC)


class FakeWriter:
    """Captures open/close calls in order."""

    def __init__(self) -> None:
        self.opened: list[PresenceInterval] = []
        self.closed: list[PresenceInterval] = []

    def create_session(self, class_section, subject, mode):
        return "sess-1", START

    def end_session(self, session_id, ends_at):
        pass

    def open_interval(self, row):
        self.opened.append(row)

    def close_interval(self, row):
        self.closed.append(row)


def test_state_change_closes_then_opens_same_row_id() -> None:
    fw = FakeWriter()
    rec = SessionRecorder(writer=fw, session_id="sess-1", session_start=START)

    rec.record([("s1", "PRESENT")], 0.0)
    rec.record([("s1", "UNVERIFIED")], 30.0)
    rec.close(90.0)

    # Two opens (PRESENT, UNVERIFIED); two closes — and each close is the SAME
    # row object/id that was opened, not a fresh insert.
    assert [r.state for r in fw.opened] == ["PRESENT", "UNVERIFIED"]
    assert [r.state for r in fw.closed] == ["PRESENT", "UNVERIFIED"]
    assert fw.closed[0].id == fw.opened[0].id
    assert fw.closed[1].id == fw.opened[1].id
    # Close timestamps: PRESENT closed at +30s, UNVERIFIED at +90s
    assert (fw.closed[0].ended_at - START).total_seconds() == 30.0
    assert (fw.closed[1].ended_at - START).total_seconds() == 90.0


def test_absolute_timestamps_from_relative() -> None:
    fw = FakeWriter()
    rec = SessionRecorder(writer=fw, session_id="s", session_start=START)
    rec.record([("s1", "PRESENT")], 45.0)
    assert (fw.opened[0].started_at - START).total_seconds() == 45.0


def test_close_is_idempotent_per_student() -> None:
    fw = FakeWriter()
    rec = SessionRecorder(writer=fw, session_id="s", session_start=START)
    rec.record([("s1", "PRESENT")], 0.0)
    rec.close(60.0)
    rec.close(120.0)  # nothing open anymore — must not double-close
    assert len(fw.closed) == 1


def test_noop_writer_is_offline() -> None:
    w = NoopWriter()
    session_id, starts_at = w.create_session("MCA-4B", "DS", "lecture")
    assert session_id == "noop-session"
    assert starts_at.tzinfo is not None
    row = PresenceInterval("s", "s1", "PRESENT", START)
    w.open_interval(row)
    w.close_interval(row)
    w.end_session("noop-session", START)  # no exception, no network


def test_build_writer_defaults_to_noop_when_unconfigured(monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.supabase_url", "")
    monkeypatch.setattr("app.config.settings.supabase_secret_key", "")
    assert isinstance(build_writer(), NoopWriter)
