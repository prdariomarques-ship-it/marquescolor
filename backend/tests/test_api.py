import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import app
from app.database import Base, get_db
from app.models import Product, StockBalance


@pytest.fixture
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    seed = SessionLocal()
    product = Product(sku="TINTA-001", name="Tinta Acrílica 18L", unit="UN", category="imobiliaria",
                       preco_venda=189.90)
    seed.add(product)
    seed.flush()
    seed.add(StockBalance(product_id=product.id, quantity=12, avg_cost=95.5))
    pending = Product(sku="TINTA-PENDING", name="Item novo detectado por NF-e", unit="UN", pending_review=True)
    seed.add(pending)
    seed.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    engine.dispose()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_products_excludes_pending_review_by_default(client):
    response = client.get("/products")
    assert response.status_code == 200
    skus = [p["sku"] for p in response.json()]
    assert "TINTA-001" in skus
    assert "TINTA-PENDING" not in skus


def test_list_products_can_include_pending_review(client):
    response = client.get("/products", params={"include_pending_review": True})
    skus = [p["sku"] for p in response.json()]
    assert "TINTA-PENDING" in skus


def test_list_products_reports_stock_and_avg_cost(client):
    response = client.get("/products")
    product = next(p for p in response.json() if p["sku"] == "TINTA-001")
    assert product["stock"] == 12.0
    assert product["avg_cost"] == 95.5
    assert product["preco_venda"] == 189.90


def test_get_product_404_for_unknown_id(client):
    response = client.get("/products/999999")
    assert response.status_code == 404


def test_review_queue_empty_by_default(client):
    response = client.get("/review-queue")
    assert response.status_code == 200
    assert response.json() == []
