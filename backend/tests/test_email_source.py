"""Covers parse_raw_message — the pure-parsing half of email_source.py
that needs no live IMAP connection. ImapEmailSource itself (the actual
network calls) is NOT covered here; see that module's docstring."""
from email.message import EmailMessage as PyEmailMessage

from app.email_source import parse_raw_message


def _build_plain_eml(subject="Oi", body="corpo do e-mail", from_addr="joao@example.com") -> bytes:
    msg = PyEmailMessage()
    msg["Message-ID"] = "<abc123@example.com>"
    msg["From"] = from_addr
    msg["Subject"] = subject
    msg["Date"] = "Tue, 01 Oct 2024 09:30:00 -0300"
    msg.set_content(body)
    return bytes(msg)


def _build_multipart_with_attachment() -> bytes:
    msg = PyEmailMessage()
    msg["Message-ID"] = "<nfe-456@fornecedor.com>"
    msg["From"] = "Fornecedor Tintas <pedidos@fornecedor.com>"
    msg["Subject"] = "NF-e em anexo"
    msg["Date"] = "Tue, 01 Oct 2024 10:00:00 -0300"
    msg.set_content("Segue NF-e em anexo.")
    msg.add_attachment(b"<NFe>...</NFe>", maintype="application", subtype="xml", filename="nfe_001.xml")
    return bytes(msg)


def test_parses_plain_text_email():
    raw = parse_raw_message(_build_plain_eml(), to_email="loja@marquescolor.com")
    assert raw.message_id == "<abc123@example.com>"
    assert raw.from_email == "joao@example.com"
    assert raw.subject == "Oi"
    assert raw.body_text is not None and "corpo do e-mail" in raw.body_text
    assert raw.attachments == []


def test_parses_multipart_with_xml_attachment():
    raw = parse_raw_message(_build_multipart_with_attachment(), to_email="loja@marquescolor.com")
    assert raw.from_email == "pedidos@fornecedor.com"
    assert raw.from_name == "Fornecedor Tintas"
    assert len(raw.attachments) == 1
    assert raw.attachments[0].filename == "nfe_001.xml"
    assert raw.attachments[0].content == b"<NFe>...</NFe>"
    assert raw.body_text is not None and "Segue NF-e" in raw.body_text


def test_missing_message_id_gets_a_synthetic_fallback():
    msg = PyEmailMessage()
    msg["From"] = "x@example.com"
    msg.set_content("sem message id")
    raw = parse_raw_message(bytes(msg), to_email="loja@marquescolor.com")
    assert raw.message_id.startswith("<no-message-id-")


def test_source_handle_is_carried_through_unmodified():
    raw = parse_raw_message(_build_plain_eml(), to_email="loja@marquescolor.com", source_handle=b"42")
    assert raw.source_handle == b"42"
