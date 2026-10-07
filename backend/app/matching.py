"""Resolves an NF-e line item to an internal Product.

Only one real signal is trusted here: an existing
product_supplier_map(supplier_id, supplier_sku) row. There is
deliberately no fuzzy name-matching fallback ("Tinta Acrílica Suvinil
18L" vs "TINTA ACR SUVINIL BR 18L") — a wrong fuzzy match silently
merges two different products' stock, which is worse than the item
sitting in review_queue for someone to map once. The first time a given
supplier_sku is seen, it should go to review; mapping it once (confirming
or creating the product) makes every future NF-e with that same
supplier_sku resolve automatically from then on.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, ProductSupplierMap
from app.nfe_parser import ParsedNfeItem


@dataclass(frozen=True)
class ProductMatchResult:
    product: Product | None
    confidence: float
    matched_by: str | None  # "supplier_sku_map" or None


def resolve_product(session: Session, *, supplier_id: int, item: ParsedNfeItem) -> ProductMatchResult:
    if item.supplier_sku:
        mapping = session.scalar(
            select(ProductSupplierMap).where(
                ProductSupplierMap.supplier_id == supplier_id,
                ProductSupplierMap.supplier_sku == item.supplier_sku,
            )
        )
        if mapping is not None:
            product = session.get(Product, mapping.product_id)
            if product is not None and product.deleted_at is None:
                return ProductMatchResult(product=product, confidence=1.0, matched_by="supplier_sku_map")

    return ProductMatchResult(product=None, confidence=0.0, matched_by=None)


def create_supplier_mapping(
    session: Session, *, product_id: int, supplier_id: int, supplier_sku: str, supplier_name: str | None
) -> ProductSupplierMap:
    mapping = ProductSupplierMap(
        product_id=product_id, supplier_id=supplier_id, supplier_sku=supplier_sku, supplier_name=supplier_name
    )
    session.add(mapping)
    session.flush()
    return mapping
