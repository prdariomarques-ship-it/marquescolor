# Marquescolor — backend de estoque e captura de e-mail

Serviço separado do frontend React deste mesmo repositório (`../src`).
Lê NF-e de fornecedor recebidas por e-mail, extrai os itens, atualiza
estoque (ledger imutável + saldo cacheado) e cadastra produtos — sem
depender de um humano digitar a planilha. Quando a confiança é baixa
(fornecedor/SKU desconhecido, e-mail não classificável), o item vai para
`review_queue` em vez de ser cadastrado adivinhando.

## Arquitetura

```
IMAP (marquescolor@outlook.com)
        │
        ▼
app/worker.py  ── processo próprio, polling (python -m app)
        │
        ▼
app/ingest.py  ── classifica, extrai NF-e (app/nfe_parser.py),
        │          mapeia produto (app/matching.py)
        ▼
app/stock.py   ── ledger imutável (stock_movements) + saldo (stock_balance)
        │
        ▼
   Postgres (próprio desta stack — ver docker-compose.backend.yml)
        ▲
        │
app/api.py     ── FastAPI só-leitura, processo próprio (uvicorn)
        │
        ▼
Frontend React (../src) — ainda não migrado para consumir esta API
```

Dois processos (`worker`, `api`), nunca um importando o outro em tempo
de execução — só compartilham o banco.

## Rodando localmente

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Banco local em arquivo, sem precisar de Postgres:
export DATABASE_URL="sqlite:///./marquescolor.db"
alembic upgrade head

uvicorn app.api:app --reload   # API em http://localhost:8000
# noutro terminal, com INGEST_ENABLED=false (padrão) o worker só idla:
python -m app
```

## Testes

```bash
PYTHONPATH=. python -m pytest tests/ -q
```

44 testes, todos contra SQLite em memória — nenhum toca uma rede ou
mailbox real. `app/email_source.py::ImapEmailSource` (a única peça que
fala com o IMAP de verdade) não é exercida por este conjunto — ver seu
docstring e o `DEPLOYMENT_RUNBOOK.md` (passo 5) para o smoke test manual
que a substitui antes de produção.

## O que é NÃO é feito nesta versão (gaps declarados, não escondidos)

- **Divergência entrada×saída**: esta versão só trata ENTRADA (NF-e).
  Saída de venda não entra por aqui — fica para quando o fluxo de venda
  (hoje misto: caderno + sistema local primitivo) for definido. `AJUSTE`
  existe no modelo (`app/stock.py`) mas nada o produz automaticamente
  ainda.
- **Frontend ainda não migrado**: o app React (`../src`) continua com o
  estado fictício em `INITIAL_PRODUCTS`/`useState` — a API de leitura
  (`app/api.py`) existe, mas `App.tsx` não foi alterado para consumi-la.
  Isso é um passo separado e deliberadamente não feito aqui.
- **Sem endpoint de escrita**: não há como criar/editar produto ou
  confirmar um item da fila de revisão pela API ainda — só leitura.
  Resolver um item da `review_queue` hoje exige acesso direto ao banco.
- **PDF/planilha de pedido**: a extração estruturada só cobre o XML da
  NF-e (o padrão nacional). Um e-mail com PDF de boleto ou planilha é
  classificado (FINANCEIRO, etc.) mas não tem dado estruturado extraído.
- **CNPJ/chave de acesso não validados contra a SEFAZ**: o parser confia
  no conteúdo do XML — não verifica dígito verificador nem consulta se a
  NF-e está realmente autorizada/cancelada.
- **IMAP não testado contra a conta real**: ver acima.
