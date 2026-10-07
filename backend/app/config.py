"""Settings for the Marquescolor stock/email backend.

Sync SQLAlchemy throughout this service (not async) — deliberate: this is
a low-volume (~30 NF-e/month) single-store service, not a high-concurrency
HTTP app. A sync engine + a single polling worker process is simpler to
reason about and debug than the async machinery DarioOS's own backend
needs for live WhatsApp traffic; there's no concurrency load here that
would justify it.
"""
import os
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.environ.get(
        "DATABASE_URL", "sqlite:///./marquescolor.db"
    ))

    imap_host: str = field(default_factory=lambda: os.environ.get("IMAP_HOST", ""))
    imap_port: int = field(default_factory=lambda: int(os.environ.get("IMAP_PORT", "993")))
    imap_user: str = field(default_factory=lambda: os.environ.get("IMAP_USER", ""))
    imap_password: str = field(default_factory=lambda: os.environ.get("IMAP_PASSWORD", ""))
    imap_mailbox: str = field(default_factory=lambda: os.environ.get("IMAP_MAILBOX", "INBOX"))
    imap_processed_mailbox: str = field(default_factory=lambda: os.environ.get(
        "IMAP_PROCESSED_MAILBOX", "Processado"
    ))

    poll_interval_seconds: float = field(default_factory=lambda: float(
        os.environ.get("POLL_INTERVAL_SECONDS", "300")
    ))

    ingest_enabled: bool = field(default_factory=lambda: _env_bool("INGEST_ENABLED", False))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings_cache() -> None:
    """Test-only: forces get_settings() to re-read os.environ."""
    global _settings
    _settings = None
