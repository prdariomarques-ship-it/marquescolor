from decimal import Decimal

import pytest

from app.models import Product, StockBalance, StockMovementType
from app.stock import (
    AmbiguousAdjustmentDirection,
    InsufficientStockError,
    apply_movement,
    rebuild_balance_from_ledger,
)


def _make_product(session, sku="TINTA-001", name="Tinta Acrílica 18L") -> Product:
    product = Product(sku=sku, name=name, unit="UN")
    session.add(product)
    session.flush()
    return product


def test_entrada_increases_quantity_and_weighted_avg_cost(db_session):
    product = _make_product(db_session)

    apply_movement(
        db_session, product_id=product.id, type=StockMovementType.ENTRADA,
        quantity=10, unit_cost=Decimal("100.00"), source="MANUAL",
    )
    apply_movement(
        db_session, product_id=product.id, type=StockMovementType.ENTRADA,
        quantity=10, unit_cost=Decimal("120.00"), source="MANUAL",
    )
    db_session.commit()

    balance = db_session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("20")
    # weighted avg: (10*100 + 10*120) / 20 = 110
    assert balance.avg_cost == Decimal("110.00")


def test_saida_decreases_quantity_without_changing_avg_cost(db_session):
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=10, unit_cost=Decimal("50.00"), source="MANUAL")
    apply_movement(db_session, product_id=product.id, type=StockMovementType.SAIDA,
                    quantity=4, source="MANUAL")
    db_session.commit()

    balance = db_session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("6")
    assert balance.avg_cost == Decimal("50.00")


def test_saida_below_zero_raises_by_default(db_session):
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=5, unit_cost=Decimal("10.00"), source="MANUAL")

    with pytest.raises(InsufficientStockError):
        apply_movement(db_session, product_id=product.id, type=StockMovementType.SAIDA,
                        quantity=10, source="MANUAL")


def test_saida_below_zero_allowed_when_explicitly_permitted(db_session):
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=5, unit_cost=Decimal("10.00"), source="MANUAL")

    apply_movement(db_session, product_id=product.id, type=StockMovementType.SAIDA,
                    quantity=10, source="MANUAL", allow_negative=True)
    db_session.commit()

    balance = db_session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("-5")


def test_ajuste_without_direction_raises_ambiguous_error(db_session):
    product = _make_product(db_session)
    with pytest.raises(AmbiguousAdjustmentDirection):
        apply_movement(db_session, product_id=product.id, type=StockMovementType.AJUSTE,
                        quantity=3, source="MANUAL")


def test_ajuste_with_explicit_direction_applies_correctly(db_session):
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=10, unit_cost=Decimal("10.00"), source="MANUAL")

    # physical count found 2 fewer than the system says
    apply_movement(db_session, product_id=product.id, type=StockMovementType.AJUSTE,
                    quantity=2, direction=-1, source="MANUAL", notes="inventario")
    db_session.commit()

    balance = db_session.get(StockBalance, product.id)
    assert balance.quantity == Decimal("8")


def test_quantity_must_be_positive(db_session):
    product = _make_product(db_session)
    with pytest.raises(ValueError):
        apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                        quantity=-1, source="MANUAL")


def test_movement_rows_are_never_mutated_by_a_later_call(db_session):
    """The ledger is append-only: two ENTRADAs must leave two separate
    rows, each with its own original quantity/cost — never a merged or
    edited row."""
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=5, unit_cost=Decimal("10.00"), source="MANUAL")
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=7, unit_cost=Decimal("20.00"), source="MANUAL")
    db_session.commit()

    from app.models import StockMovement
    rows = db_session.query(StockMovement).filter(StockMovement.product_id == product.id).order_by(
        StockMovement.id.asc()
    ).all()
    assert len(rows) == 2
    assert rows[0].quantity == Decimal("5")
    assert rows[1].quantity == Decimal("7")


def test_rebuild_from_ledger_matches_cached_balance_for_entrada_saida_only(db_session):
    product = _make_product(db_session)
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=10, unit_cost=Decimal("100.00"), source="MANUAL")
    apply_movement(db_session, product_id=product.id, type=StockMovementType.ENTRADA,
                    quantity=5, unit_cost=Decimal("130.00"), source="MANUAL")
    apply_movement(db_session, product_id=product.id, type=StockMovementType.SAIDA,
                    quantity=3, source="MANUAL")
    db_session.commit()

    cached = db_session.get(StockBalance, product.id)
    rebuilt = rebuild_balance_from_ledger(db_session, product.id)

    assert rebuilt.new_quantity == cached.quantity
    assert rebuilt.new_avg_cost == cached.avg_cost
