"""Minimal read API for the existing MarquesColor React app to consume
instead of its current hardcoded INITIAL_PRODUCTS mock state. Read-only
on purpose for this first version — the frontend's own write paths (PDV
sale, manual stock edit) are not migrated yet; that's a separate,
larger follow-up (rewiring App.tsx's useState to call this API) that
needs its own review, not bundled silently into the e-mail/stock backend.
"""
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, ReviewQueueItem, StockBalance

app = FastAPI(title="Marquescolor Stock/Email Backend")


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    brand: str | None = None
    unit: str
    stock: float
    avg_cost: float
    preco_venda: float | None
    pending_review: bool

    model_config = {"from_attributes": True}


class ReviewQueueItemOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    reason: str
    detail: str | None
    status: str

    model_config = {"from_attributes": True}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/products", response_model=list[ProductOut])
def list_products(include_pending_review: bool = False, db: Session = Depends(get_db)) -> list[ProductOut]:
    query = select(Product, StockBalance).outerjoin(
        StockBalance, StockBalance.product_id == Product.id
    ).where(Product.deleted_at.is_(None))
    if not include_pending_review:
        query = query.where(Product.pending_review.is_(False))
    rows = db.execute(query).all()
    return [
        ProductOut(
            id=p.id, sku=p.sku, name=p.name, brand=p.category, unit=p.unit,
            stock=float(balance.quantity) if balance else 0.0,
            avg_cost=float(balance.avg_cost) if balance else 0.0,
            preco_venda=float(p.preco_venda) if p.preco_venda is not None else None,
            pending_review=p.pending_review,
        )
        for p, balance in rows
    ]


@app.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    product = db.get(Product, product_id)
    if product is None or product.deleted_at is not None:
        raise HTTPException(status_code=404, detail="product not found")
    balance = db.get(StockBalance, product_id)
    return ProductOut(
        id=product.id, sku=product.sku, name=product.name, brand=product.category, unit=product.unit,
        stock=float(balance.quantity) if balance else 0.0,
        avg_cost=float(balance.avg_cost) if balance else 0.0,
        preco_venda=float(product.preco_venda) if product.preco_venda is not None else None,
        pending_review=product.pending_review,
    )


@app.get("/review-queue", response_model=list[ReviewQueueItemOut])
def list_review_queue(status: str = "PENDENTE", db: Session = Depends(get_db)) -> list[ReviewQueueItemOut]:
    rows = db.query(ReviewQueueItem).filter(ReviewQueueItem.status == status).order_by(
        ReviewQueueItem.created_at.asc()
    ).all()
    return [ReviewQueueItemOut.model_validate(r) for r in rows]
