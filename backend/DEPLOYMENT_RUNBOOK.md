# Runbook de implantação — Marquescolor stock/email backend

**Status: NÃO EXECUTADO.** Nenhum comando deste documento foi rodado
contra a VPS. Esta sessão de desenvolvimento não tem acesso de rede à
VPS nem credenciais reais do e-mail — este é um roteiro para quem tiver
acesso executar manualmente, passo a passo.

## O que isto NÃO toca

- O projeto `darioos` (backend WhatsApp, Postgres do DarioOS, openwa) —
  stack completamente separada, Postgres próprio, rede Docker própria
  (`marquescolor`, não `darioos`), nenhum contêiner ou volume
  compartilhado.
- O projeto `darioos-evolution`.
- Qualquer outro cliente/projeto na mesma VPS.

## Passo 0 — Pré-requisitos

- Docker + Docker Compose já instalados na VPS (já estão, pelo projeto
  darioos existente).
- Uma pasta própria para este projeto (ex.: `/opt/marquescolor-backend`),
  com este repositório clonado dentro (branch `feature/email-stock-backend`
  até ser revisada e mesclada).
- Decisão de credencial de e-mail: a conta `marquescolor@outlook.com`
  precisa de uma senha de aplicativo (app password) dedicada para IMAP —
  não a senha normal de login. No Outlook/Microsoft: Conta Microsoft →
  Segurança → Opções de segurança avançadas → Senhas de aplicativo. Se a
  conta não tiver 2FA ativo, considere ativar antes deste passo —
  senha de aplicativo normalmente exige 2FA habilitado.

## Passo 1 — Configurar o `.env`

```bash
cd /opt/marquescolor-backend/backend
cp .env.example .env
nano .env
```

Preencha pelo menos:
- `MARQUESCOLOR_DB_PASSWORD` — gere com `openssl rand -base64 24`.
- `IMAP_USER` / `IMAP_PASSWORD` — o e-mail da loja e a senha de
  aplicativo do passo 0.
- Deixe `INGEST_ENABLED=false` por enquanto — o próximo passo sobe tudo
  com o worker ainda inofensivo (não toca a caixa de entrada real).

## Passo 2 — Build e subir o banco + API primeiro (sem o worker ainda)

```bash
docker compose -f docker-compose.backend.yml build
docker compose -f docker-compose.backend.yml up -d postgres api
docker compose -f docker-compose.backend.yml ps
```

Verificação:

```bash
curl http://localhost:8001/health
# esperado: {"status":"ok"}
curl http://localhost:8001/products
# esperado: [] (banco novo, ainda sem produtos)
```

## Passo 3 — Aplicar a migração

```bash
docker compose -f docker-compose.backend.yml exec api sh -c "cd /app && alembic upgrade head"
```

Verificação:

```bash
docker compose -f docker-compose.backend.yml exec postgres psql -U "$MARQUESCOLOR_DB_USER" -d "$MARQUESCOLOR_DB_NAME" -c "\dt"
```

Deve listar `products`, `suppliers`, `stock_movements`, `stock_balance`,
`emails`, `email_attachments`, `nfe_documents`, `nfe_items`,
`review_queue`, `processing_logs`, `product_supplier_map`,
`alembic_version`.

## Passo 4 — Cadastro inicial de produtos (opcional, mas recomendado)

Antes de ligar a ingestão de e-mail, vale cadastrar manualmente os
produtos que a loja já vende regularmente — isso evita que as primeiras
NF-e caiam todas em `review_queue` por falta de mapeamento. Pode ser um
script simples ou inserts diretos; não há endpoint de escrita na API
ainda (ver "Próximos passos" no README do backend).

## Passo 5 — Smoke test de IMAP (manual, antes de ligar o worker)

Antes de confiar no worker, confirme que a credencial de IMAP realmente
funciona, rodando isto manualmente uma vez:

```bash
docker compose -f docker-compose.backend.yml run --rm api python -c "
from app.config import get_settings
from app.email_source import ImapEmailSource
s = get_settings()
source = ImapEmailSource(s)
emails = source.fetch_unseen()
print(f'{len(emails)} e-mail(s) não lidos encontrados')
for e in emails[:3]:
    print(e.message_id, e.from_email, e.subject)
"
```

Isto SÓ LÊ (fetch_unseen não marca nada como visto) — rodar isto não tem
efeito colateral na caixa de entrada real. Se der erro de autenticação,
revise a senha de aplicativo antes de continuar.

## Passo 6 — Ligar o worker

No `.env`:
```bash
INGEST_ENABLED=true
```

```bash
docker compose -f docker-compose.backend.yml up -d worker
docker compose -f docker-compose.backend.yml logs -f worker
```
(ctrl-C depois de ver um ciclo de poll limpo)

```bash
docker compose -f docker-compose.backend.yml ps worker   # esperar "healthy"
```

## Passo 7 — Acompanhar a fila de revisão

```bash
curl http://localhost:8001/review-queue
```

Nos primeiros dias, espere a maioria dos SKUs de fornecedor caírem aqui
(é o comportamento certo — ninguém mapeou ainda qual SKU do fornecedor
corresponde a qual produto interno). Mapear uma vez
(`product_supplier_map`) resolve permanentemente aquele SKU para as
próximas NF-e do mesmo fornecedor.

## Rollback

```bash
docker compose -f docker-compose.backend.yml stop worker
```

Para tudo: `docker compose -f docker-compose.backend.yml down` (os dados
do Postgres continuam no volume `marquescolor_postgres_data` a menos que
você rode com `-v`).
