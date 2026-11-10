# Contrato do PRODUTOR — o que a Fase 5 (NF-e) realmente entrega

Inventário técnico fiel, gerado **a partir do código** (`apps/api/src/modules/nfe/servico.ts` → `dadosParaCusto`, `nfe.routes.ts`, `prisma/schema.prisma`) e de **payloads reais** capturados num banco SQLite isolado de teste em 2026-11-10 (commit-base `25dba2c` + endurecimentos locais descritos em §9). Destinatário: o responsável pelo motor de preços (GLM), que valida o lado consumidor.

**Escopo e limites.** Este documento descreve **dados**, não cálculo. Ele **não define** fórmulas de custo, margem, markup nem tributação, e nada aqui deve ser lido como recomendação econômica. Não foi lido nem alterado `motor-precos.ts`, `precos.routes.ts`, `precos.schemas.ts` nem modelos do motor (o commit `c011f4a` do GLM **não existe** neste repositório local). A compatibilidade com o motor **não foi testada**. Documento complementar (visão mais ampla, anterior): [`nfe-pricing-contract.md`](nfe-pricing-contract.md).

## 1. Endpoint

`GET /api/nfe/documentos/:id/dados-custo` — papel **ADMIN ou GERENTE** (`401` sem token, `403` outros papéis).

| Resposta | Condição |
|---|---|
| `200` | `NfeDocument.statusCompra = APROVADA` (aprovação humana) |
| `409` `{ "erro": "Dados de custo so ficam disponiveis apos aprovacao humana da NF-e" }` | qualquer outro estado (não aprovada, rejeitada, em revisão, etc.) |
| `404` | documento inexistente |

Observações de comportamento (verificadas):

- A leitura é **ao vivo** (não é um *snapshot* imutável): `quantidadeRecebida`, `estagios.*` e `custoAtualProdutoCentavos` mudam conforme o documento avança ou conforme o custo do produto é alterado por **outro** módulo. O consumidor que precisar de reprodutibilidade deve **gravar** o que consumiu.
- Não há `ETag`, versão de leitura nem paginação.
- Disponível **já após a aprovação**, antes do recebimento físico (nesse caso `quantidadeRecebida = null` e `estagios.recebimentoFisicoConfirmado = false`).

## 2. Payload real (JSON produzido pelo código)

Exemplo capturado **após** aprovação, recebimento físico parcial (8 de 10) e conversão de unidade (1 CX → 6 UN), com frete e desconto no documento. IDs substituídos por `<cuid>`; valores são **sintéticos** (CNPJ fictício com DV válido).

```json
{
  "contrato": "nfe-pricing-contract/v1",
  "documento": {
    "id": "<cuid>",
    "chaveAcesso": "35261011222333000181550010000010011079269199",
    "numero": "1001",
    "serie": "1",
    "dataEmissao": "2026-10-20T13:00:00.000Z",
    "fonteDados": "XML",
    "fornecedorId": "<cuid>",
    "emitenteCnpj": "11222333000181",
    "emitenteCrt": "1",
    "emitenteUf": "SP",
    "aprovadoEm": "2026-11-10T16:48:30.481Z",
    "aprovadoPorId": "<cuid>"
  },
  "estagios": {
    "aprovada": true,
    "recebimentoFisicoConfirmado": true,
    "estoqueAtualizado": true,
    "custoAtualizadoPorEsteModulo": false,
    "precoAprovadoPorEsteModulo": false
  },
  "totaisDocumento": {
    "produtosCentavos": 18346, "freteCentavos": 500, "seguroCentavos": 0, "descontoCentavos": 250, "outrasCentavos": 0,
    "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 0, "pisCentavos": 0, "cofinsCentavos": 0,
    "notaCentavos": 18596
  },
  "itens": [
    {
      "itemNfeId": "<cuid>", "produtoId": "<cuid>", "codigoInterno": "TIN-018",
      "custoAtualProdutoCentavos": 1250,
      "quantidadeNf": 10, "quantidadeRecebida": 8,
      "unidade": "UN", "unidadeTributavel": "UN",
      "quantidadeOriginal": "10.0000", "valorUnitarioOriginal": "12.3456789000", "valorTotalCentavos": 12346,
      "freteCentavos": 0, "seguroCentavos": 0, "descontoCentavos": 0, "outrasCentavos": 0,
      "impostos": { "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 0, "pisCentavos": 0, "cofinsCentavos": 0 },
      "fiscal": { "ncm": "32091010", "cest": "1000100", "cfop": "5102", "origem": "0", "cst": null, "csosn": "102" },
      "origemDados": "XML"
    },
    {
      "itemNfeId": "<cuid>", "produtoId": "<cuid>", "codigoInterno": "LAT-036",
      "custoAtualProdutoCentavos": 1000,
      "quantidadeNf": 1, "quantidadeRecebida": 6,
      "unidade": "CX", "unidadeTributavel": "CX",
      "quantidadeOriginal": "1.0000", "valorUnitarioOriginal": "60.0000000000", "valorTotalCentavos": 6000,
      "freteCentavos": 0, "seguroCentavos": 0, "descontoCentavos": 0, "outrasCentavos": 0,
      "impostos": { "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 120, "pisCentavos": 0, "cofinsCentavos": 0 },
      "fiscal": { "ncm": "32091010", "cest": null, "cfop": "5405", "origem": "0", "cst": "60", "csosn": null },
      "origemDados": "XML"
    }
  ]
}
```

### 2.1 Exemplo de documento de fonte **não-XML** (texto de PDF, aprovado após revisão humana, sem recebimento)

Diferenças observadas: `fonteDados`/`origemDados` = `"PDF_TEXTO"`; `emitenteCrt`/`emitenteUf` = `null`; `fiscal.origem` = `null`; `impostos.*` = `0` e `cest`/`gtin` ausentes (**não são lidos** de PDF/OCR); `quantidadeRecebida = null`; `estagios.recebimentoFisicoConfirmado = false`.

```json
{
  "documento": { "chaveAcesso": "35261011222333000181550010000020021158538380", "fonteDados": "PDF_TEXTO", "emitenteCrt": null, "emitenteUf": null,
                  "dataEmissao": "2026-10-20T03:00:00.000Z" },
  "estagios": { "aprovada": true, "recebimentoFisicoConfirmado": false, "estoqueAtualizado": false,
                "custoAtualizadoPorEsteModulo": false, "precoAprovadoPorEsteModulo": false },
  "itens": [ { "fiscal": { "ncm": "32091010", "cest": null, "cfop": "5102", "origem": null, "cst": null, "csosn": "102" },
               "impostos": { "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 0, "pisCentavos": 0, "cofinsCentavos": 0 }, "origemDados": "PDF_TEXTO" } ]
}
```

## 3. Tipos, nulabilidade e obrigatoriedade

Legenda: **O** = sempre presente (chave existe) · **N** = pode ser `null` · valores monetários **inteiros em centavos** (`Int`), nunca `float`.

### 3.1 Raiz
`contrato` (O, string, hoje `"nfe-pricing-contract/v1"`) · `documento` (O) · `estagios` (O) · `totaisDocumento` (O) · `itens` (O, array, ordenado por `numeroItem`; pode ser **vazio** se nenhum item estiver vinculado — na prática a aprovação exige ao menos um).

### 3.2 `documento`
| Campo | Tipo | Nulo? | Notas |
|---|---|---|---|
| `id` | string (cuid) | não | |
| `chaveAcesso` | string (44 dígitos) | **sim** | `null` se a leitura PDF/OCR não achou chave (pendência `CHAVE_AUSENTE`, que um humano pode aceitar). Em fonte não-XML pode ser chave **com DV inválido** (também aceitável por humano): **o payload não informa `chaveValida`** (ver §8) |
| `numero`, `serie` | string | sim | sem zeros à esquerda (derivados da chave quando vêm de PDF/OCR) |
| `dataEmissao` | string ISO‑8601 UTC | sim | XML: `dhEmi` convertido; PDF/OCR: data `dd/mm/aaaa` às 00:00 `-03:00` |
| `fonteDados` | `"XML" \| "PDF_TEXTO" \| "OCR" \| "MULTIMODAL"` | não | |
| `fornecedorId` | string | não* | *a aprovação exige fornecedor vinculado; o tipo Prisma é nulável |
| `emitenteCnpj` | string (14 dígitos, só números) | sim | |
| `emitenteCrt` | `"1" \| "2" \| "3"` (texto do XML) | sim | **só XML**. Regime do **emitente**; a Fase 5 não conhece o regime da **loja** |
| `emitenteUf` | string(2) | sim | só XML |
| `aprovadoEm` | string ISO | não | |
| `aprovadoPorId` | string | sim | id do usuário aprovador |

### 3.3 `estagios` (todos `boolean`, não nulos)
`aprovada` (sempre `true` quando o endpoint responde 200 — redundante), `recebimentoFisicoConfirmado`, `estoqueAtualizado`, `custoAtualizadoPorEsteModulo` (**sempre `false`**), `precoAprovadoPorEsteModulo` (**sempre `false`**).

### 3.4 `totaisDocumento` (todos `integer`, **nunca nulos**)
`produtosCentavos`, `freteCentavos`, `seguroCentavos`, `descontoCentavos`, `outrasCentavos`, `icmsCentavos`, `icmsStCentavos`, `ipiCentavos`, `pisCentavos`, `cofinsCentavos`, `notaCentavos`.
**Limitação:** quando o total não foi lido (PDF/OCR, ou XML sem o grupo `total`), o valor vira **`0`** — o payload **não distingue "zero" de "não lido"**. `produtosCentavos` cai para a soma dos itens se ausente.

### 3.5 `itens[]`
| Campo | Tipo | Nulo? | Notas |
|---|---|---|---|
| `itemNfeId` | string | não | |
| `produtoId` | string | não | só aparecem itens **vinculados** (`MAPEADO`/`CONFIRMADO`) |
| `codigoInterno` | string | sim (na prática não) | |
| `custoAtualProdutoCentavos` | integer | sim | leitura **ao vivo** de `Produto.precoCustoCentavos` (`0` se nunca definido). Só comparação |
| `quantidadeNf` | number (Float) | não | na **unidade da NF** |
| `quantidadeRecebida` | number | **sim** | `null` até o recebimento físico; **na unidade do produto** quando as unidades diferem |
| `unidade`, `unidadeTributavel` | string | sim | `unidadeTributavel` só XML |
| `quantidadeOriginal` | string decimal | não | texto exato do XML (até 4 casas) |
| `valorUnitarioOriginal` | string decimal | não | texto exato (até 10 casas) |
| `valorTotalCentavos` | integer | não | `vProd` do item |
| `freteCentavos`, `seguroCentavos`, `descontoCentavos`, `outrasCentavos` | integer | não | **nível do item**; `0` se ausente (não distingue "não lido") |
| `impostos.{icms,icmsSt,ipi,pis,cofins}Centavos` | integer | não | valores do XML; **sempre `0` em PDF/OCR/multimodal** |
| `fiscal.{ncm,cest,cfop,origem,cst,csosn}` | string | sim | `origem` = `orig` do ICMS (só XML); `cst` e `csosn` mutuamente exclusivos na prática |
| `origemDados` | `"XML" \| "PDF_TEXTO" \| "OCR" \| "MULTIMODAL"` | não | |

Todos os campos listados estão **sempre presentes como chave** (nunca omitidos); "opcional" significa apenas valor `null`/`0`.

## 4. Significado dos estados (campos do `NfeDocument` — etapas separadas)

| Campo | Valores | Significado |
|---|---|---|
| `statusDocumento` | `INTERPRETADO`, `FALHA_INTERPRETACAO` | o arquivo virou dados |
| `statusConferencia` | `PENDENTE`, `EM_REVISAO`, `CONFERIDA`, `REJEITADA` | `EM_REVISAO` = há pendência **bloqueante** aberta; `CONFERIDA` = humano aprovou; `REJEITADA` = descartada |
| `statusCompra` | `NAO_PREPARADA`, `PREPARADA`, `APROVADA` | `PREPARADA` = sem bloqueio, fornecedor e todos os itens resolvidos (pronta p/ decisão humana); `APROVADA` = decisão humana registrada |
| `recebimentoFisicoEm` | data/`null` | mercadoria conferida fisicamente por humano |
| `statusEstoque` | `NAO_APLICADO`, `APLICADO`, `FALHA` | `APLICADO` só após aprovação **e** recebimento físico |
| (fora daqui) | — | **custo atualizado** e **preço aprovado** não existem na Fase 5 |

Vínculo de item (não vai no payload, só em `GET /documentos/:id`): `MAPEADO` (mapa código-fornecedor→produto), `SUGERIDO` (GTIN exato; exige confirmação), `CONFIRMADO` (humano), `DISPENSADO` (humano: não entra), `SEM_CORRESPONDENCIA`.

## 5. Regras de aprovação humana (código real)

`POST /api/nfe/documentos/:id/aprovar` — ADMIN/GERENTE; corpo `{ observacao?, reconheceAlertas=false }`:

1. Documento `INTERPRETADO`, não rejeitado, não aprovado.
2. A conciliação é **reexecutada** antes de decidir (fornecedor, vínculos, divergências).
3. **Zero** pendências **bloqueantes** abertas, `statusCompra = PREPARADA`, fornecedor vinculado, todos os itens em `MAPEADO`/`CONFIRMADO`/`DISPENSADO`.
4. Se houver **alertas** abertos, exige `reconheceAlertas: true`; eles ficam `RESOLVIDO` com `resolucao = "ACEITO_NA_APROVACAO…"` e `resolvidoPorId` (rastreável).
5. Pelo menos um item elegível e o snapshot `compraPreparada` é gravado no log (`COMPRA_APROVADA`).
6. **Efeitos:** `statusCompra=APROVADA`, `statusConferencia=CONFERIDA`, `aprovadoPorId/Em`. **Não** cria `Compra`, **não** move estoque, **não** altera custo/preço.

Motivos que **não** podem ser dispensados manualmente (exigem corrigir o dado ou rejeitar): `FORNECEDOR_DESCONHECIDO`, `PRODUTO_DESCONHECIDO`, `PRODUTO_SUGERIDO_CONFIRMAR`, `EVENTO_FISCAL_CANCELAMENTO`, `FALHA_INTEGRACAO_ESTOQUE`. Fonte **não-XML** (`FONTE_NAO_XML`) é bloqueante, mas um humano **pode aceitá-la** com observação — portanto **`estagios.aprovada = true` não garante fonte XML**.

Recebimento físico (`POST …/confirmar-recebimento`): exige aprovação; quantidade recebida por item (ou `recebimentoIntegral`, **recusado** se a unidade da NF difere da do produto); divergência de quantidade/unidade exige `motivoDivergencia`; só então o estoque entra, em transação única, e a `Compra` nasce já `CONFIRMADA`.

## 6. Condições para disponibilizar os dados (resumo)

`statusCompra = APROVADA` **e** usuário ADMIN/GERENTE. Para uso **definitivo** pelo motor recomenda-se exigir também `estagios.recebimentoFisicoConfirmado = true` (a quantidade recebida pode divergir da NF); essa escolha é do consumidor — o endpoint não a impõe.

## 7. Origem e confiança dos dados

- **No payload:** `documento.fonteDados` e `itens[].origemDados` (iguais hoje).
- **Fora do payload** (em `GET /api/nfe/documentos/:id`): `confianca` (`XML=0.98`, `PDF_TEXTO=0.6`, `OCR`/`MULTIMODAL=0.4`; heurística fixa, **não** é métrica estatística), `chaveValida`, `origemCamposJson` (campo → trecho/fonte), `statusVinculo`/`vinculoOrigem`, `revisoes[]`, `historico[]`.
- XML é a **única** fonte com impostos por item, CEST, GTIN, CRT, UF e protocolo. OCR comprovadamente erra dígitos (observado: CNPJ `11.222.888/0001-8`).
- O sistema **não** consulta a SEFAZ: "aprovada" aqui é aprovação **humana interna**, não autorização fiscal.

## 8. Limitações existentes (para o consumidor decidir)

1. **Sem `confianca`, `chaveValida`, `statusVinculo`, `gtin`, `descricao`, condições de pagamento/duplicatas, protocolo, `compraId`, `movimentacaoEstoqueId`** no payload (existem no banco/`GET documentos/:id`). Condições de pagamento estão em `NfeDocument.pagamentoJson` e **não** são entregues.
2. **Sem unidade do produto** no payload: com `unidade = "CX"` e `quantidadeRecebida = 6` o consumidor não vê que a unidade do produto é `UN`; precisa consultar o produto.
3. **Zero ≠ não lido** em totais, frete/seguro/desconto/outras e impostos (§3.4/3.5). Para PDF/OCR esses zeros significam "não extraído".
4. **Soma dos itens ≠ total** quando há itens dispensados/não vinculados (os totais do documento incluem todos; `itens[]` só os vinculados).
5. **Frete/seguro/desconto/outras** do documento **não são rateados** nos itens (nem aqui nem em lugar algum da Fase 5); o rateio, se existir, é do consumidor.
6. **`custoAtualProdutoCentavos` é ao vivo**, não o custo vigente na data da NF.
7. **Regime tributário da loja** e crédito de impostos: desconhecidos pela Fase 5 (só `emitenteCrt`).
8. **CFOP não filtra**: nada impede compra com CFOP de remessa/devolução/bonificação (parâmetro do contador pendente).
9. Documento XML cancelado/denegado só é detectado se o XML de **evento** chegar; sem consulta à SEFAZ.
10. `ItemCompra` gerado no recebimento é **informativo** e pode não reconciliar (`quantidade × precoCustoCentavos ≠ subtotalCentavos`).
11. Leitura sem *snapshot* (§1) e sem versão de esquema além de `v1` (campos novos serão aditivos).
12. O contrato **não foi validado** contra o motor real.

**Possíveis acréscimos aditivos (NÃO implementados; só se o GLM pedir):** `documento.confianca`, `documento.chaveValida`, `itens[].unidadeProduto`, `itens[].statusVinculo`, `documento.pagamentos[]`, e indicador de "valor não lido" (`null`) em vez de `0`.

## 9. Mudanças desta sessão que afetam o produtor (locais, **não publicadas**)

- Endurecimento de concorrência em `servico.ts` (compare-and-set do recebimento físico e do estoque); sem mudança de payload.
- `reprocessar` de arquivo com original adulterado passa a responder `409` (antes: erro genérico).
- Testes novos em `test/nfe-seguranca.test.ts`. Estas alterações estão **apenas no worktree local**; o PR #2 **não** foi modificado.
