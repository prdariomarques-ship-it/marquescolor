FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Two processes run from this one image, as two separate Compose services
# (see docker-compose.backend.yml) — never both in one container:
#   api:    uvicorn app.api:app       (read endpoints for the frontend)
#   worker: python -m app             (IMAP polling + ingestion)
# No HEALTHCHECK baked in here since the two services need different
# checks (HTTP /health vs a heartbeat file) — each service in the compose
# file defines its own.
