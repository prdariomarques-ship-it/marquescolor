"""Reads e-mails off the real mailbox via IMAP. This is the one module in
this service that actually talks to an external system — everything else
(classifier, nfe_parser, matching, stock, ingest) operates on plain
in-memory data and is fully unit-tested. ImapEmailSource itself is NOT
exercised against a live mailbox by this test suite: no real IMAP
credentials exist in this environment, and this service must not try to
reach the real marquescolor@outlook.com account before the operator
explicitly configures and approves it. Before relying on this in
production, do a manual connectivity smoke test (see the deployment
runbook) against the real account once credentials are set.
"""
import email
import imaplib
from dataclasses import dataclass, field
from datetime import datetime
from email.utils import parseaddr, parsedate_to_datetime
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True)
class RawAttachment:
    filename: str
    content_type: str
    content: bytes


@dataclass(frozen=True)
class RawEmail:
    message_id: str
    from_email: str
    from_name: str | None
    to_email: str
    subject: str | None
    body_text: str | None
    received_at: datetime
    attachments: list[RawAttachment] = field(default_factory=list)
    # Opaque handle the source needs to later mark this message processed
    # (e.g. an IMAP UID) — ingest.py never inspects this, just passes it
    # back to mark_processed().
    source_handle: object = None


class EmailSource(Protocol):
    def fetch_unseen(self) -> list[RawEmail]: ...
    def mark_processed(self, raw: RawEmail) -> None: ...


def _decode_header_value(value: str | None) -> str | None:
    if value is None:
        return None
    decoded_parts = email.header.decode_header(value)
    chunks = []
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            chunks.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            chunks.append(part)
    return "".join(chunks).strip() or None


def parse_raw_message(raw_bytes: bytes, *, to_email: str, source_handle: object = None) -> RawEmail:
    """Parses RFC 822 bytes into a RawEmail — split out from
    ImapEmailSource so it's unit-testable without any IMAP connection at
    all (feed it a canned .eml byte string)."""
    msg = email.message_from_bytes(raw_bytes)

    from_name, from_email = parseaddr(msg.get("From", ""))
    subject = _decode_header_value(msg.get("Subject"))

    received_at = datetime.now()
    date_header = msg.get("Date")
    if date_header:
        try:
            received_at = parsedate_to_datetime(date_header)
        except (TypeError, ValueError):
            pass

    body_text = None
    attachments: list[RawAttachment] = []

    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition") or "")
            content_type = part.get_content_type()
            filename = part.get_filename()
            filename = _decode_header_value(filename)

            if filename and ("attachment" in content_disposition or content_type not in ("text/plain", "text/html")):
                payload = part.get_payload(decode=True)
                if payload is not None:
                    attachments.append(RawAttachment(filename=filename, content_type=content_type, content=payload))
            elif content_type == "text/plain" and body_text is None:
                payload = part.get_payload(decode=True)
                if payload is not None:
                    charset = part.get_content_charset() or "utf-8"
                    body_text = payload.decode(charset, errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload is not None:
            charset = msg.get_content_charset() or "utf-8"
            body_text = payload.decode(charset, errors="replace")

    return RawEmail(
        message_id=msg.get("Message-ID", "").strip() or f"<no-message-id-{id(raw_bytes)}>",
        from_email=from_email or "",
        from_name=from_name or None,
        to_email=to_email,
        subject=subject,
        body_text=body_text,
        received_at=received_at,
        attachments=attachments,
        source_handle=source_handle,
    )


class ImapEmailSource:
    def __init__(self, settings: Settings):
        self._settings = settings

    def _connect(self) -> imaplib.IMAP4_SSL:
        conn = imaplib.IMAP4_SSL(self._settings.imap_host, self._settings.imap_port)
        conn.login(self._settings.imap_user, self._settings.imap_password)
        conn.select(self._settings.imap_mailbox)
        return conn

    def fetch_unseen(self) -> list[RawEmail]:
        conn = self._connect()
        try:
            status, data = conn.search(None, "UNSEEN")
            if status != "OK":
                return []
            uids = data[0].split()
            results: list[RawEmail] = []
            for uid in uids:
                status, msg_data = conn.fetch(uid, "(RFC822)")
                if status != "OK" or not msg_data or msg_data[0] is None:
                    continue
                raw_bytes = msg_data[0][1]
                results.append(
                    parse_raw_message(raw_bytes, to_email=self._settings.imap_user, source_handle=uid)
                )
            return results
        finally:
            conn.logout()

    def mark_processed(self, raw: RawEmail) -> None:
        """Marks the message \\Seen and copies it to the processed
        mailbox — never deletes the original, so a bug downstream can
        always be re-diagnosed against the real source e-mail."""
        if raw.source_handle is None:
            return
        conn = self._connect()
        try:
            uid = raw.source_handle
            conn.store(uid, "+FLAGS", "\\Seen")
            try:
                conn.copy(uid, self._settings.imap_processed_mailbox)
            except imaplib.IMAP4.error:
                pass  # processed mailbox may not exist yet — not fatal, message stays Seen in INBOX
        finally:
            conn.logout()
