"""Standalone polling process — python -m app. Never imports anything
from a FastAPI request path; the read API (app/api.py) and this worker
share only the database, never a running process."""
import json
import logging
import time
from datetime import datetime, timezone

from app.config import get_settings
from app.database import get_session
from app.email_source import EmailSource, ImapEmailSource, RawEmail
from app.ingest import ingest_email

logger = logging.getLogger(__name__)

# Same reasoning as DarioOS's own financial-worker heartbeat: a
# timestamp alone only proves the loop is spinning (liveness), not that
# the last poll could actually reach the mailbox/database (readiness).
# consecutive_poll_failures folds that in, so a worker stuck failing
# every cycle doesn't report "healthy" just because the process is alive.
HEARTBEAT_PATH = "/tmp/marquescolor_worker_heartbeat"
CONSECUTIVE_FAILURE_THRESHOLD = 5


def run_once(source: EmailSource) -> int:
    """Processes every currently-unseen message once. Returns how many
    were fetched (not how many succeeded — see per-message logging)."""
    raw_emails: list[RawEmail] = source.fetch_unseen()
    for raw in raw_emails:
        session = get_session()
        try:
            ingest_email(session, raw)
        except Exception:  # noqa: BLE001 - one bad message must not kill the poll loop
            logger.exception("Failed to ingest message_id=%r — left unseen, will retry next poll", raw.message_id)
            session.rollback()
            continue
        finally:
            session.close()
        # Only reached on a clean (possibly partially-erroed-but-committed) ingest —
        # marking processed here, not inside ingest_email, keeps "did we commit"
        # and "did we tell the mailbox we're done with it" clearly separate steps.
        try:
            source.mark_processed(raw)
        except Exception:  # noqa: BLE001 - IMAP flakiness marking Seen must not crash the loop
            logger.exception("Ingested message_id=%r but failed to mark it processed on the mailbox", raw.message_id)
    return len(raw_emails)


def _write_heartbeat(path: str, *, ok: bool, consecutive_failures: int) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "consecutive_poll_failures": consecutive_failures,
        "healthy": ok and consecutive_failures < CONSECUTIVE_FAILURE_THRESHOLD,
    }
    try:
        with open(path, "w") as f:
            json.dump(payload, f)
    except OSError:
        logger.warning("Could not write heartbeat file %s", path)


def run_forever(heartbeat_path: str = HEARTBEAT_PATH) -> None:
    settings = get_settings()
    if not settings.ingest_enabled:
        logger.warning("INGEST_ENABLED is false — worker will idle and never poll the mailbox.")

    source = ImapEmailSource(settings)
    consecutive_failures = 0
    while True:
        ok = True
        if settings.ingest_enabled:
            try:
                count = run_once(source)
                logger.info("Poll cycle: %d message(s) fetched", count)
                consecutive_failures = 0
            except Exception:  # noqa: BLE001 - connection drop, auth failure, etc. — survive and retry
                logger.exception("Poll cycle failed")
                ok = False
                consecutive_failures += 1
        _write_heartbeat(heartbeat_path, ok=ok, consecutive_failures=consecutive_failures)
        time.sleep(settings.poll_interval_seconds)
