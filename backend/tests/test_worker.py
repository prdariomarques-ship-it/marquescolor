from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.email_source import RawEmail
from app import worker as worker_module


class _FakeSource:
    def __init__(self, emails: list[RawEmail]):
        self._emails = emails
        self.marked_processed: list[str] = []

    def fetch_unseen(self) -> list[RawEmail]:
        return self._emails

    def mark_processed(self, raw: RawEmail) -> None:
        self.marked_processed.append(raw.message_id)


def _raw(message_id: str) -> RawEmail:
    return RawEmail(
        message_id=message_id, from_email="x@example.com", from_name=None,
        to_email="marquescolor@outlook.com", subject="Oi", body_text=None,
        received_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def patched_session_factory(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(worker_module, "get_session", SessionLocal)
    yield SessionLocal
    engine.dispose()


def test_run_once_marks_each_fetched_email_processed(patched_session_factory):
    source = _FakeSource([_raw("<a@x>"), _raw("<b@x>")])
    count = worker_module.run_once(source)
    assert count == 2
    assert source.marked_processed == ["<a@x>", "<b@x>"]


def test_run_once_does_not_mark_processed_when_ingest_raises(patched_session_factory, monkeypatch):
    def _boom(session, raw):
        raise RuntimeError("simulated ingest crash")

    monkeypatch.setattr(worker_module, "ingest_email", _boom)
    source = _FakeSource([_raw("<will-fail@x>")])

    count = worker_module.run_once(source)

    assert count == 1
    assert source.marked_processed == [], "a crashed ingest must leave the message unmarked, so it's retried"


def test_run_once_with_no_messages_is_a_noop(patched_session_factory):
    source = _FakeSource([])
    assert worker_module.run_once(source) == 0
    assert source.marked_processed == []


def test_heartbeat_reports_unhealthy_past_the_failure_threshold(tmp_path):
    path = str(tmp_path / "heartbeat.json")
    worker_module._write_heartbeat(path, ok=False, consecutive_failures=worker_module.CONSECUTIVE_FAILURE_THRESHOLD)

    import json
    with open(path) as f:
        payload = json.load(f)
    assert payload["healthy"] is False


def test_heartbeat_reports_healthy_when_ok_and_under_threshold(tmp_path):
    path = str(tmp_path / "heartbeat.json")
    worker_module._write_heartbeat(path, ok=True, consecutive_failures=0)

    import json
    with open(path) as f:
        payload = json.load(f)
    assert payload["healthy"] is True
