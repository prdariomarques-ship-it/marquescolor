"""Trimmed, single-tenant schema for the Marquescolor stock/email backend.

Deliberately NOT the full multi-tenant SaaS schema (client_id on every
table, CRM leads/opportunities, WhatsApp conversations, consents, user
audit trail) — this serves one store. Tenancy, if this is ever
productized for a second store, is achieved at the database level (a
separate Postgres database + role per store, same isolation pattern
already used for DarioOS's own financial-monitors module), not by a
shared-schema column — simpler to reason about at this scale, and no
rewrite needed later: a second store just gets its own database.

Soft delete (deleted_at) on master data (Supplier, Product) — never hard
DELETE there, since a product/supplier disappearing would break the
FK history on stock_movements and nfe_items. stock_movements itself is
an append-only ledger: never UPDATEd or DELETEd after insert, only
compensated with a new ADJUSTMENT row — see app/stock.py.
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# ── suppliers / products ────────────────────────────────────────────────────


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(18), unique=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("sku", name="ux_products_sku"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    ean: Mapped[str | None] = mapped_column(String(14), index=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(String(10), default="UN", nullable=False)
    ncm: Mapped[str | None] = mapped_column(String(10))
    category: Mapped[str | None] = mapped_column(String(100))
    preco_venda: Mapped[float | None] = mapped_column(Numeric(12, 2))
    margem_minima_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    # Created automatically from an unrecognized NF-e item, not yet
    # confirmed by a human — stock IS NOT updated for a pending_review
    # product until confirmed (see app/ingest.py).
    pending_review: Mapped[bool] = mapped_column(default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProductSupplierMap(Base, TimestampMixin):
    """Maps a supplier's own SKU (as it appears on their NF-e) to our
    internal product — without this, the same paint would get
    re-registered as a 'new' product every time a different supplier's
    code for it shows up."""

    __tablename__ = "product_supplier_map"
    __table_args__ = (UniqueConstraint("supplier_id", "supplier_sku", name="ux_supplier_sku"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    supplier_sku: Mapped[str] = mapped_column(String(80), nullable=False)
    supplier_name: Mapped[str | None] = mapped_column(String(300))  # xProd as it came on the NF-e

    product: Mapped["Product"] = relationship()
    supplier: Mapped["Supplier"] = relationship()


# ── stock ────────────────────────────────────────────────────────────────


class StockMovementType(str, enum.Enum):
    ENTRADA = "ENTRADA"
    SAIDA = "SAIDA"
    AJUSTE = "AJUSTE"
    DEVOLUCAO = "DEVOLUCAO"


class StockMovement(Base):
    """Append-only ledger. Never updated or deleted after insert — a
    correction is a new AJUSTE row, so the full history always
    reconciles (sum of movements == current balance, always, by
    construction — see app/stock.py)."""

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)  # always positive; type gives sign
    unit_cost: Mapped[float | None] = mapped_column(Numeric(12, 4))
    total_cost: Mapped[float | None] = mapped_column(Numeric(14, 2))
    source: Mapped[str] = mapped_column(String(30), nullable=False)  # EMAIL_NFE, MANUAL, ...
    source_ref: Mapped[str | None] = mapped_column(String(100))  # e.g. nfe_documents.id
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class StockBalance(Base):
    """Materialized current balance per product — updated transactionally
    in the same DB transaction as the StockMovement insert that changes
    it (see app/stock.py::apply_movement). Can always be rebuilt from
    stock_movements if it ever drifts; it's a cache, not the source of
    truth."""

    __tablename__ = "stock_balance"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), default=0, nullable=False)
    avg_cost: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    last_movement_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── email ingestion ─────────────────────────────────────────────────────


class EmailCategory(str, enum.Enum):
    NF_E = "NF_E"
    PEDIDO_FORNECEDOR = "PEDIDO_FORNECEDOR"
    PEDIDO_CLIENTE = "PEDIDO_CLIENTE"
    INFO_INTERNA = "INFO_INTERNA"
    FINANCEIRO = "FINANCEIRO"
    SPAM = "SPAM"
    DESCONHECIDO = "DESCONHECIDO"


class EmailStatus(str, enum.Enum):
    RECEBIDO = "RECEBIDO"
    PROCESSANDO = "PROCESSANDO"
    PROCESSADO = "PROCESSADO"
    REVISAO_HUMANA = "REVISAO_HUMANA"
    ERRO = "ERRO"
    IGNORADO = "IGNORADO"


class EmailMessage(Base):
    """One row per e-mail read from the mailbox. Never deleted — an
    irrelevant e-mail is marked IGNORADO, not removed, so the ingestion
    log always accounts for every message the mailbox ever delivered."""

    __tablename__ = "emails"
    __table_args__ = (UniqueConstraint("message_id", name="ux_emails_message_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[str] = mapped_column(String(300), nullable=False)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    from_name: Mapped[str | None] = mapped_column(String(200))
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500))
    body_text: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    category: Mapped[EmailCategory | None] = mapped_column(Enum(EmailCategory))
    classification_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    status: Mapped[EmailStatus] = mapped_column(Enum(EmailStatus), default=EmailStatus.RECEBIDO, nullable=False)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class EmailAttachment(Base):
    __tablename__ = "email_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column()
    storage_path: Mapped[str | None] = mapped_column(String(500))
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class NfeDocument(Base):
    __tablename__ = "nfe_documents"
    __table_args__ = (UniqueConstraint("chave_acesso", name="ux_nfe_chave_acesso"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email_id: Mapped[int | None] = mapped_column(ForeignKey("emails.id"))
    attachment_id: Mapped[int | None] = mapped_column(ForeignKey("email_attachments.id"))
    chave_acesso: Mapped[str | None] = mapped_column(String(44))
    numero: Mapped[str | None] = mapped_column(String(20))
    serie: Mapped[str | None] = mapped_column(String(10))
    emitente_cnpj: Mapped[str | None] = mapped_column(String(18))
    emitente_nome: Mapped[str | None] = mapped_column(String(300))
    destinatario_cnpj: Mapped[str | None] = mapped_column(String(18))
    data_emissao: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valor_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_frete: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_impostos: Mapped[float | None] = mapped_column(Numeric(14, 2))
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    status: Mapped[str] = mapped_column(String(20), default="PROCESSADA")  # PROCESSADA, REVISAO, DUPLICADA
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class NfeItem(Base):
    __tablename__ = "nfe_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    nfe_id: Mapped[int] = mapped_column(ForeignKey("nfe_documents.id"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    supplier_sku: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(300))
    ncm: Mapped[str | None] = mapped_column(String(10))
    cfop: Mapped[str | None] = mapped_column(String(10))
    quantity: Mapped[float | None] = mapped_column(Numeric(14, 3))
    unit: Mapped[str | None] = mapped_column(String(10))
    unit_cost: Mapped[float | None] = mapped_column(Numeric(12, 4))
    total_cost: Mapped[float | None] = mapped_column(Numeric(14, 2))
    mapped: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── human review + audit ────────────────────────────────────────────────


class ReviewQueueItem(Base):
    """'Se não tiver certeza, não cadastra — sinaliza humano.' Anything
    the automatic pipeline couldn't classify/extract/map with enough
    confidence lands here instead of silently guessing."""

    __tablename__ = "review_queue"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # EMAIL, NFE_ITEM
    entity_id: Mapped[int] = mapped_column(nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)  # LOW_CONFIDENCE, UNKNOWN_SUPPLIER, ...
    detail: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE", nullable=False)  # PENDENTE, RESOLVIDO
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ProcessingLog(Base):
    """Lightweight audit trail of what the automated pipeline did — not
    the full user-access audit_trail of a multi-tenant platform (out of
    scope here), just: what happened to each e-mail/NF-e/item, when, and
    with what result."""

    __tablename__ = "processing_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int | None] = mapped_column()
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # OK, WARN, ERROR
    message: Mapped[str | None] = mapped_column(Text)
    correlation_id: Mapped[str | None] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
