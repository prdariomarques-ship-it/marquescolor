from datetime import datetime, timezone
from decimal import Decimal

from app.email_source import RawAttachment, RawEmail
from app.ingest import ingest_email
from app.matching import create_supplier_mapping
from app.models import (
    EmailCategory,
    EmailStatus,
    NfeItem,
    Product,
    StockBalance,
    Supplier,
)

_NFE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe35240512345678000199550010000012345123456789" versao="4.00">
    <ide><nNF>12345</nNF><serie>1</serie><dhEmi>2024-10-01T09:30:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000199</CNPJ><xNome>Tintas Suvinil Distribuidora S.A.</xNome></emit>
    <dest><CNPJ>98765432000111</CNPJ></dest>
    <det nItem="1">
      <prod>
        <cProd>SUV-18L-BR</cProd><xProd>Tinta Acrílica Fosca Branca 18L</xProd>
        <NCM>32091090</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
        <qCom>10.0000</qCom><vUnCom>95.5000</vUnCom><vProd>955.00</vProd>
      </prod>
    </det>
    <total><ICMSTot><vICMS>120.50</vICMS><vFrete>45.00</vFrete><vNF>955.00</vNF></ICMSTot></total>
  </infNFe>
</NFe>
"""


def _make_nfe_email(message_id="<nfe-1@suvinil>", xml=_NFE_XML) -> RawEmail:
    return RawEmail(
        message_id=message_id,
        from_email="pedidos@suvinil.com.br",
        from_name="Suvinil Pedidos",
        to_email="marquescolor@outlook.com",
        subject="NF-e 12345",
        body_text=None,
        received_at=datetime.now(timezone.utc),
        attachments=[RawAttachment(filename="nfe_12345.xml", content_type="application/xml", content=xml.encode("utf-8"))],
    )


def test_nfe_with_known_mapping_applies_stock(db_session):
    supplier = Supplier(name="Tintas Suvinil Distribuidora S.A.", cnpj="12345678000199")
    db_session.add(supplier)
    db_session.flush()
    product = Product(sku="TINTA-SUV-18L", name="Tinta Acrílica Fosca Branca 18L", unit="UN")
    db_session.add(product)
    db_session.flush()
    create_supplier_mapping(db_session, product_id=product.id, supplier_id=supplier.id,
                             supplier_sku="SUV-18L-BR", supplier_name="Tinta Acrílica Fosca Branca 18L")
    db_session.commit()

    result = ingest_email(db_session, _make_nfe_email())

    assert result.category == EmailCategory.NF_E
    assert result.status == EmailStatus.PROCESSADO
    assert result.review_queue_ids == []

    balance = db_session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("10.0000")
    assert balance.avg_cost == Decimal("95.5000")


def test_nfe_with_unknown_supplier_sku_goes_to_review_not_stock(db_session):
    result = ingest_email(db_session, _make_nfe_email())

    assert result.category == EmailCategory.NF_E
    assert len(result.review_queue_ids) == 1

    item = db_session.query(NfeItem).filter(NfeItem.supplier_sku == "SUV-18L-BR").one()
    assert item.mapped is False
    assert item.product_id is None

    # No product exists yet, so there's nothing to have a non-zero StockBalance for.
    assert db_session.query(StockBalance).count() == 0


def test_duplicate_message_id_is_not_reprocessed(db_session):
    first = ingest_email(db_session, _make_nfe_email())
    second = ingest_email(db_session, _make_nfe_email())

    assert first.skipped_duplicate is False
    assert second.skipped_duplicate is True
    assert second.email_id == first.email_id
    # Only one review_queue row for the one unmapped item — a second
    # ingest of the identical message must not create a second one.
    from app.models import ReviewQueueItem
    assert db_session.query(ReviewQueueItem).count() == 1


def test_duplicate_chave_acesso_in_a_different_email_does_not_double_apply_stock():
    """The same NF-e forwarded/resent in a second, different e-mail
    (different Message-ID) must not be counted as a second delivery of
    the same goods — this is the exact 'crash and retry' scenario that
    would otherwise double a stock entry."""
    from app.database import Base
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    supplier = Supplier(name="Tintas Suvinil Distribuidora S.A.", cnpj="12345678000199")
    session.add(supplier)
    session.flush()
    product = Product(sku="TINTA-SUV-18L", name="Tinta Acrílica Fosca Branca 18L", unit="UN")
    session.add(product)
    session.flush()
    create_supplier_mapping(session, product_id=product.id, supplier_id=supplier.id,
                             supplier_sku="SUV-18L-BR", supplier_name="x")
    session.commit()

    ingest_email(session, _make_nfe_email(message_id="<attempt-1@suvinil>"))
    ingest_email(session, _make_nfe_email(message_id="<attempt-2-resend@suvinil>"))

    balance = session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("10.0000"), "same chave_acesso resent must not double the stock entry"

    from app.models import StockMovement
    assert session.query(StockMovement).filter(StockMovement.product_id == product.id).count() == 1
    session.close()
    engine.dispose()


def test_malformed_nfe_item_does_not_crash_the_whole_email(db_session, monkeypatch):
    """If applying a specific item's movement raises for some reason
    (e.g. a future allow_negative-style guard), the rest of the e-mail
    must still be recorded, not thrown away — partial success, not
    all-or-nothing, with the failure visible in processing_logs."""
    import app.ingest as ingest_module

    supplier = Supplier(name="Tintas Suvinil Distribuidora S.A.", cnpj="12345678000199")
    db_session.add(supplier)
    db_session.flush()
    product = Product(sku="TINTA-SUV-18L", name="X", unit="UN")
    db_session.add(product)
    db_session.flush()
    create_supplier_mapping(db_session, product_id=product.id, supplier_id=supplier.id,
                             supplier_sku="SUV-18L-BR", supplier_name="x")
    db_session.commit()

    def _boom(*args, **kwargs):
        raise ValueError("simulated failure")

    monkeypatch.setattr(ingest_module, "apply_movement", _boom)

    result = ingest_email(db_session, _make_nfe_email())

    assert result.status == EmailStatus.ERRO
    from app.models import EmailMessage
    email_row = db_session.get(EmailMessage, result.email_id)
    assert email_row is not None  # the email itself was still persisted


def test_financeiro_email_is_filed_without_review(db_session):
    raw = RawEmail(
        message_id="<boleto-1@banco>", from_email="cobranca@banco.com.br", from_name=None,
        to_email="marquescolor@outlook.com", subject="Boleto - vencimento em 5 dias",
        body_text=None, received_at=datetime.now(timezone.utc),
    )
    result = ingest_email(db_session, raw)
    assert result.category == EmailCategory.FINANCEIRO
    assert result.status == EmailStatus.PROCESSADO
    assert result.review_queue_ids == []


def test_unclassifiable_email_goes_to_review(db_session):
    raw = RawEmail(
        message_id="<random-1@example>", from_email="alguem@example.com", from_name=None,
        to_email="marquescolor@outlook.com", subject="Oi", body_text="tudo bem?",
        received_at=datetime.now(timezone.utc),
    )
    result = ingest_email(db_session, raw)
    assert result.category == EmailCategory.DESCONHECIDO
    assert result.status == EmailStatus.REVISAO_HUMANA
    assert len(result.review_queue_ids) == 1
