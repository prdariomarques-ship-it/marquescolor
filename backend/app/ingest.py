"""Orchestrates one e-mail through the pipeline: classify -> (if NF-e)
extract + match + apply stock -> persist + log. This is the module
test_ingest.py exercises directly with in-memory RawEmail objects — no
IMAP involved — so the actual decision logic is fully covered without
needing a real mailbox.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.email_classifier import classify_email
from app.email_source import RawAttachment, RawEmail
from app.matching import resolve_product
from app.models import (
    EmailAttachment,
    EmailCategory,
    EmailMessage,
    EmailStatus,
    NfeDocument,
    NfeItem,
    ProcessingLog,
    ReviewQueueItem,
    Supplier,
)
from app.nfe_parser import NfeParseError, ParsedNfe, parse_nfe_xml
from app.stock import InsufficientStockError, StockMovementType, apply_movement


@dataclass
class IngestResult:
    email_id: int
    category: EmailCategory
    status: EmailStatus
    nfe_document_ids: list[int] = field(default_factory=list)
    review_queue_ids: list[int] = field(default_factory=list)
    skipped_duplicate: bool = False


def _log(session: Session, *, entity_type: str, entity_id: int | None, action: str,
         status: str, message: str | None, correlation_id: str) -> None:
    session.add(ProcessingLog(
        entity_type=entity_type, entity_id=entity_id, action=action,
        status=status, message=message, correlation_id=correlation_id,
    ))


def get_or_create_supplier(session: Session, *, cnpj: str | None, name: str | None, email_addr: str | None) -> Supplier | None:
    if not cnpj:
        return None
    supplier = session.query(Supplier).filter(Supplier.cnpj == cnpj, Supplier.deleted_at.is_(None)).first()
    if supplier is not None:
        return supplier
    supplier = Supplier(name=name or cnpj, cnpj=cnpj, email=email_addr)
    session.add(supplier)
    session.flush()
    return supplier


def _try_parse_nfe_attachments(attachments: list[RawAttachment]) -> list[tuple[RawAttachment, ParsedNfe]]:
    parsed: list[tuple[RawAttachment, ParsedNfe]] = []
    for attachment in attachments:
        if not attachment.filename.lower().endswith(".xml"):
            continue
        try:
            parsed.append((attachment, parse_nfe_xml(attachment.content)))
        except NfeParseError:
            continue
    return parsed


def ingest_email(session: Session, raw: RawEmail) -> IngestResult:
    correlation_id = str(uuid.uuid4())

    existing = session.query(EmailMessage).filter(EmailMessage.message_id == raw.message_id).first()
    if existing is not None:
        _log(session, entity_type="EMAIL", entity_id=existing.id, action="SKIP_DUPLICATE",
             status="OK", message=f"message_id {raw.message_id!r} already ingested", correlation_id=correlation_id)
        return IngestResult(email_id=existing.id, category=existing.category, status=existing.status,
                             skipped_duplicate=True)

    nfe_candidates = _try_parse_nfe_attachments(raw.attachments)

    email_row = EmailMessage(
        message_id=raw.message_id,
        from_email=raw.from_email,
        from_name=raw.from_name,
        to_email=raw.to_email,
        subject=raw.subject,
        body_text=raw.body_text,
        received_at=raw.received_at,
        status=EmailStatus.PROCESSANDO,
    )
    session.add(email_row)
    session.flush()

    for attachment in raw.attachments:
        session.add(EmailAttachment(
            email_id=email_row.id, filename=attachment.filename,
            mime_type=attachment.content_type, size_bytes=len(attachment.content),
        ))

    result = IngestResult(email_id=email_row.id, category=EmailCategory.DESCONHECIDO, status=EmailStatus.PROCESSADO)

    if nfe_candidates:
        email_row.category = EmailCategory.NF_E
        email_row.classification_confidence = 0.98
        result.category = EmailCategory.NF_E
        had_error = False

        for attachment, parsed in nfe_candidates:
            try:
                had_error = _ingest_one_nfe(
                    session, parsed=parsed, email_row=email_row,
                    correlation_id=correlation_id, result=result,
                ) or had_error
            except Exception as exc:  # noqa: BLE001 - one malformed NF-e must not sink the whole email
                had_error = True
                _log(session, entity_type="EMAIL", entity_id=email_row.id, action="NFE_INGEST_FAILED",
                     status="ERROR", message=f"{type(exc).__name__}: {exc}", correlation_id=correlation_id)

        email_row.status = EmailStatus.ERRO if had_error else EmailStatus.PROCESSADO
        email_row.processed_at = datetime.now(timezone.utc)
        if had_error:
            email_row.error_message = "um ou mais itens/NF-e desta mensagem falharam — ver processing_logs"
        result.status = email_row.status
    else:
        classification = classify_email(
            from_email=raw.from_email, subject=raw.subject, body_text=raw.body_text,
            known_supplier_emails=_known_supplier_emails(session),
            internal_domain=_domain_of(raw.to_email),
        )
        email_row.category = classification.category
        email_row.classification_confidence = classification.confidence
        result.category = classification.category

        # DESCONHECIDO is the only case nothing automatic can act on
        # confidently; every other category here is just filed (no stock
        # or money action follows it in this version), so being filed as
        # e.g. FINANCEIRO at 0.7 confidence instead of 0.95 carries no
        # real risk — being wrong about filing a boleto under FINANCEIRO
        # vs PEDIDO_FORNECEDOR has no operational consequence, unlike an
        # NF-e item's product match, which DOES carry one and is
        # therefore gated on an exact map hit, not a confidence score
        # (see app/matching.py).
        if classification.category == EmailCategory.DESCONHECIDO:
            email_row.status = EmailStatus.REVISAO_HUMANA
            review = ReviewQueueItem(
                entity_type="EMAIL", entity_id=email_row.id, reason="UNCLASSIFIED",
                detail=f"from={raw.from_email!r} subject={raw.subject!r}",
            )
            session.add(review)
            session.flush()
            result.review_queue_ids.append(review.id)
        else:
            email_row.status = EmailStatus.PROCESSADO
        email_row.processed_at = datetime.now(timezone.utc)
        result.status = email_row.status

        _log(session, entity_type="EMAIL", entity_id=email_row.id, action="CLASSIFIED",
             status="OK", message=classification.category.value, correlation_id=correlation_id)

    session.commit()
    return result


def _ingest_one_nfe(session: Session, *, parsed: ParsedNfe, email_row: EmailMessage,
                     correlation_id: str, result: IngestResult) -> bool:
    """Returns True if something in this NF-e needs attention (an error,
    not merely an item routed to review — routing to review is the
    pipeline working as designed, not a failure)."""
    had_error = False

    if parsed.chave_acesso:
        dup = session.query(NfeDocument).filter(NfeDocument.chave_acesso == parsed.chave_acesso).first()
        if dup is not None:
            _log(session, entity_type="NFE", entity_id=dup.id, action="SKIP_DUPLICATE_CHAVE",
                 status="OK", message=f"chave_acesso {parsed.chave_acesso} already processed as nfe_documents.id={dup.id}",
                 correlation_id=correlation_id)
            return False

    supplier = get_or_create_supplier(
        session, cnpj=parsed.emitente_cnpj, name=parsed.emitente_nome, email_addr=email_row.from_email
    )

    nfe_row = NfeDocument(
        email_id=email_row.id,
        chave_acesso=parsed.chave_acesso,
        numero=parsed.numero,
        serie=parsed.serie,
        emitente_cnpj=parsed.emitente_cnpj,
        emitente_nome=parsed.emitente_nome,
        destinatario_cnpj=parsed.destinatario_cnpj,
        data_emissao=parsed.data_emissao,
        valor_total=parsed.valor_total,
        valor_frete=parsed.valor_frete,
        valor_impostos=parsed.valor_impostos,
        supplier_id=supplier.id if supplier else None,
        status="PROCESSADA",
    )
    session.add(nfe_row)
    session.flush()
    result.nfe_document_ids.append(nfe_row.id)

    for item in parsed.items:
        match = resolve_product(session, supplier_id=supplier.id, item=item) if supplier else None
        mapped = match is not None and match.product is not None

        nfe_item_row = NfeItem(
            nfe_id=nfe_row.id,
            product_id=match.product.id if mapped else None,
            supplier_sku=item.supplier_sku,
            description=item.description,
            ncm=item.ncm,
            cfop=item.cfop,
            quantity=item.quantity,
            unit=item.unit,
            unit_cost=item.unit_cost,
            total_cost=item.total_cost,
            mapped=mapped,
        )
        session.add(nfe_item_row)
        session.flush()

        if mapped and item.quantity is not None:
            try:
                apply_movement(
                    session, product_id=match.product.id, type=StockMovementType.ENTRADA,
                    quantity=item.quantity, unit_cost=item.unit_cost,
                    source="EMAIL_NFE", source_ref=str(nfe_row.id),
                    notes=f"NF-e {parsed.numero}/{parsed.serie} — {item.description}",
                )
                _log(session, entity_type="NFE_ITEM", entity_id=nfe_item_row.id, action="STOCK_APPLIED",
                     status="OK", message=f"+{item.quantity} {item.unit or ''}".strip(), correlation_id=correlation_id)
            except (InsufficientStockError, ValueError) as exc:
                had_error = True
                _log(session, entity_type="NFE_ITEM", entity_id=nfe_item_row.id, action="STOCK_APPLY_FAILED",
                     status="ERROR", message=str(exc), correlation_id=correlation_id)
        else:
            review = ReviewQueueItem(
                entity_type="NFE_ITEM", entity_id=nfe_item_row.id,
                reason="UNKNOWN_SUPPLIER_SKU" if supplier else "UNKNOWN_SUPPLIER",
                detail=f"supplier_sku={item.supplier_sku!r} description={item.description!r}",
            )
            session.add(review)
            session.flush()
            result.review_queue_ids.append(review.id)
            _log(session, entity_type="NFE_ITEM", entity_id=nfe_item_row.id, action="ROUTED_TO_REVIEW",
                 status="WARN", message=review.reason, correlation_id=correlation_id)

    return had_error


def _known_supplier_emails(session: Session) -> frozenset[str]:
    rows = session.query(Supplier.email).filter(Supplier.email.isnot(None)).all()
    return frozenset(r[0].lower() for r in rows if r[0])


def _domain_of(address: str) -> str | None:
    if "@" not in address:
        return None
    return address.rsplit("@", 1)[1]
