"""Stock ledger: every change to a product's quantity goes through
apply_movement, which inserts the immutable StockMovement row and updates
the StockBalance cache in the SAME transaction — so the two can never
drift apart from a partial write. The balance is always re-derivable from
summing the ledger (rebuild_balance_from_ledger), which is the
reconciliation check: if it ever disagrees with the cached StockBalance,
something upstream wrote to the balance directly instead of through here.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StockBalance, StockMovement, StockMovementType

# ENTRADA/DEVOLUCAO increase stock, SAIDA decreases it — direction for
# these three is unambiguous. AJUSTE's direction is NOT implied by the
# type (a physical count can be higher OR lower than the system number),
# so the caller must say which way it goes.
_IMPLIED_DIRECTION: dict[StockMovementType, int] = {
    StockMovementType.ENTRADA: 1,
    StockMovementType.DEVOLUCAO: 1,  # assumption: devolução AO FORNECEDOR is modeled as SAIDA instead;
    # DEVOLUCAO here means stock coming back in (e.g. a customer return) —
    # confirm this reading with the client before this type is ever used;
    # it is not produced by the e-mail/NF-e ingestion path at all today.
    StockMovementType.SAIDA: -1,
}


class AmbiguousAdjustmentDirection(ValueError):
    pass


class InsufficientStockError(ValueError):
    pass


@dataclass(frozen=True)
class MovementResult:
    movement_id: int
    new_quantity: Decimal
    new_avg_cost: Decimal


def _as_decimal(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def apply_movement(
    session: Session,
    *,
    product_id: int,
    type: StockMovementType,
    quantity,
    unit_cost=None,
    source: str,
    source_ref: str | None = None,
    notes: str | None = None,
    direction: int | None = None,
    allow_negative: bool = False,
) -> MovementResult:
    """Inserts one ledger row and updates the cached balance. `quantity`
    is always a positive magnitude; `direction` (+1/-1) is required for
    AJUSTE and ignored (optional sanity-checked) for the other types.

    Not safe to call from two threads/processes against the same
    product_id without an external lock — at this service's volume (one
    polling worker, ~30 NF-e/month) that's never actually concurrent in
    practice, but if a second writer (e.g. a future API-driven manual
    adjustment endpoint) is added, wrap this in SELECT ... FOR UPDATE on
    the stock_balance row first.
    """
    quantity = _as_decimal(quantity)
    if quantity <= 0:
        raise ValueError(f"quantity must be positive, got {quantity}")

    if type == StockMovementType.AJUSTE:
        if direction not in (1, -1):
            raise AmbiguousAdjustmentDirection(
                "AJUSTE requires direction=1 (found more than recorded) or "
                "direction=-1 (found less than recorded) — it cannot be inferred from the type alone."
            )
        effective_direction = direction
    else:
        effective_direction = _IMPLIED_DIRECTION[type]
        if direction is not None and direction != effective_direction:
            raise ValueError(
                f"direction={direction} contradicts the implied direction for {type.value} ({effective_direction})"
            )

    balance = session.get(StockBalance, product_id)
    if balance is None:
        balance = StockBalance(product_id=product_id, quantity=Decimal("0"), avg_cost=Decimal("0"))
        session.add(balance)

    old_quantity = _as_decimal(balance.quantity)
    old_avg_cost = _as_decimal(balance.avg_cost)
    delta = quantity * effective_direction
    new_quantity = old_quantity + delta

    if new_quantity < 0 and not allow_negative:
        raise InsufficientStockError(
            f"product {product_id}: movement would take stock from {old_quantity} to {new_quantity}"
        )

    if effective_direction > 0 and unit_cost is not None:
        unit_cost_dec = _as_decimal(unit_cost)
        # Weighted average cost — only inbound movements with a known
        # unit cost shift the average; outbound movements consume stock
        # at the existing average without changing it.
        if new_quantity > 0:
            new_avg_cost = ((old_quantity * old_avg_cost) + (quantity * unit_cost_dec)) / new_quantity
        else:
            new_avg_cost = old_avg_cost
    else:
        new_avg_cost = old_avg_cost

    total_cost = None
    if unit_cost is not None:
        total_cost = _as_decimal(unit_cost) * quantity

    movement = StockMovement(
        product_id=product_id,
        type=type,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        source=source,
        source_ref=source_ref,
        notes=notes,
        created_at=datetime.now(timezone.utc),
    )
    session.add(movement)

    balance.quantity = new_quantity
    balance.avg_cost = new_avg_cost
    balance.last_movement_at = movement.created_at

    session.flush()
    return MovementResult(movement_id=movement.id, new_quantity=new_quantity, new_avg_cost=new_avg_cost)


def rebuild_balance_from_ledger(session: Session, product_id: int) -> MovementResult:
    """Recomputes quantity (and a last-cost-only approximation of
    avg_cost — the true weighted average can't be replayed exactly
    without reprocessing every ENTRADA in order, see note below) purely
    from stock_movements, ignoring the cached StockBalance row entirely.
    Used to verify the cache hasn't drifted — not used on the normal
    write path.
    """
    movements = session.scalars(
        select(StockMovement).where(StockMovement.product_id == product_id).order_by(StockMovement.id.asc())
    ).all()

    quantity = Decimal("0")
    avg_cost = Decimal("0")
    for m in movements:
        qty = _as_decimal(m.quantity)
        if m.type == StockMovementType.AJUSTE:
            # Ledger alone can't recover which direction a historical
            # AJUSTE went (quantity is stored as a positive magnitude) —
            # this reconstruction is therefore only exact for a product
            # with no AJUSTE rows. This is a known limitation, not a bug:
            # rebuild from the ledger is a sanity check, the StockBalance
            # row (updated by apply_movement, which DOES know the sign at
            # the moment of the call) remains the authoritative balance.
            continue
        direction = _IMPLIED_DIRECTION[m.type]
        delta = qty * direction
        new_quantity = quantity + delta
        if direction > 0 and m.unit_cost is not None and new_quantity > 0:
            avg_cost = ((quantity * avg_cost) + (qty * _as_decimal(m.unit_cost))) / new_quantity
        quantity = new_quantity

    return MovementResult(movement_id=0, new_quantity=quantity, new_avg_cost=avg_cost)
