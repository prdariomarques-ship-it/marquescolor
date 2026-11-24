# API de NF-e / documentos — contratos

Prefixo `/api`. Autenticação `Authorization: Bearer <token>` (mesmo JWT do restante da API). Papéis: **GER** = ADMIN ou GERENTE; **ADM** = ADMIN; **AUT** = qualquer usuário autenticado (leitura). Erros: `{ "erro": "texto", "detalhes"?: ... }`. Implementação: `apps/api/src/modules/nfe/nfe.routes.ts` (rotas) e `servico.ts` (regras). Nenhuma rota pré-existente foi alterada ou duplicada (`/api/nfe/*` é novo).

Códigos usados: `400` entrada inválida · `401/403` autenticação/papel · `404` não encontrado · `409` estado incompatível · `422` regra de negócio (pendência bloqueante, divergência sem justificativa…) · `502` falha de integração (estoque, caixa de e-mail) · `503` não configurado.

## Recebimento e arquivos

| Método e caminho | Papel | Descrição |
|---|---|---|
| `POST /nfe/upload` | GER | `multipart/form-data`, campo(s) `arquivo` (até 10 arquivos, 15 MB cada; XML, PDF, PNG, JPEG — tipo decidido pela **assinatura**, não pela extensão). Preserva o original, roda o pipeline híbrido. `201 { resultados: [ { nome, arquivoId, duplicado, status, tipoDetectado, metodo, documentoIds, acao?, erro?, etapas[] } ] }`. `acao`: `CRIADO`, `DUPLICADO`, `PROMOVIDO_PARA_XML`, `IGNORADO_FONTE_INFERIOR`, `EVENTO_REGISTRADO`. `status` do arquivo: `INTERPRETADO`, `SEM_DADOS`, `FALHA`. Mesmo conteúdo (SHA-256) → `duplicado:true` com os mesmos IDs. |
| `GET /nfe/arquivos/:id` | AUT | Metadados do arquivo (hash, tipo, método, erro) e documentos gerados. |
| `GET /nfe/arquivos/:id/original` | GER | Baixa o arquivo **original** exatamente como recebido. |
| `POST /nfe/arquivos/:id/reprocessar` | GER | Reexecuta o pipeline sobre o original (útil após corrigir o OCR). Idempotente: mesmos IDs, sem duplicar documentos. Verifica o SHA-256 do original antes. |

## Documentos (NF-e)

| Método e caminho | Papel | Descrição |
|---|---|---|
| `GET /nfe/documentos` | AUT | Lista paginada. Filtros: `statusConferencia`, `statusCompra`, `statusEstoque`, `fornecedorId`, `busca` (chave, número, emitente, CNPJ), `page`, `pageSize` (≤100). Cada item traz `pendenciasAbertas`. |
| `GET /nfe/documentos/:id` | AUT | Detalhe: cabeçalho fiscal, `itens[]` (com `produto`), `fornecedor`, `arquivo`, `email`, `revisoes[]` e `historico[]` (ProcessingLog). |
| `POST /nfe/documentos/:id/reconciliar` | GER | Reexecuta fornecedor → correspondência de produtos → divergências → fila → estados. Idempotente. |
| `GET /nfe/documentos/:id/compra-preparada` | AUT | Snapshot da compra preparada (itens elegíveis, totais, `prontaParaAprovacao`). **Sem efeito** em estoque/custo/compras. |
| `POST /nfe/documentos/:id/vincular-fornecedor` | GER | `{ fornecedorId }`. Recusa `422` se o CNPJ do fornecedor diverge do emitente. O fornecedor deve **já existir** (não há cadastro automático). |
| `POST /nfe/itens/:id/vincular-produto` | GER | `{ produtoId, criarMapeamento = true }`. Decisão humana → `statusVinculo=CONFIRMADO`; com `criarMapeamento`, grava `ProdutoFornecedorMap` (código do fornecedor → produto) para as próximas notas. |
| `POST /nfe/itens/:id/dispensar` | GER | `{ motivo ≥5 }`. Marca "não entra em estoque" (`DISPENSADO`). |
| `POST /nfe/documentos/:id/aprovar` | GER | `{ observacao?, reconheceAlertas = false }`. Exige **0 pendências bloqueantes**, fornecedor vinculado e todos os itens resolvidos. Com alertas abertos exige `reconheceAlertas:true` (ficam registrados como aceitos pelo usuário). **Não** movimenta estoque, **não** altera custo/preço e **não** cria `Compra`. |
| `POST /nfe/documentos/:id/rejeitar` | GER | `{ motivo ≥5 }`. Recusa se o estoque já foi atualizado. |
| `POST /nfe/documentos/:id/confirmar-recebimento` | GER | Exige aprovação. Corpo: `{ recebimentoIntegral? }` **ou** `{ itens:[{ itemId, quantidadeRecebida }], motivoDivergencia? }`. `motivoDivergencia` (≥5) é obrigatório se qualquer quantidade diferir da NF **ou** se a unidade da NF diferir da do produto (nesse caso `recebimentoIntegral` é recusado: informe a quantidade na unidade do produto). Registra o recebimento físico (etapa A) e em seguida tenta o estoque (etapa B). `200 { jaAplicado, movimentos[] }`. Se o estoque falhar: `502`, **nenhum saldo muda**, `statusEstoque=FALHA`, pendência `FALHA_INTEGRACAO_ESTOQUE`. |
| `POST /nfe/documentos/:id/aplicar-estoque` | GER | Repete só a etapa B (após falha). Idempotente por item (`movimentacaoEstoqueId` único). |
| `GET /nfe/documentos/:id/dados-custo` | GER | Payload do contrato `nfe-pricing-contract/v1`. `409` antes da aprovação. Ver `nfe-pricing-contract.md`. |

Efeito de `confirmar-recebimento`/`aplicar-estoque` quando bem-sucedidos (uma única transação): `MovimentacaoEstoque` tipo `ENTRADA_COMPRA` (`documentoRef = "NF-e <chave>"`), `Produto.estoqueAtual` += quantidade **recebida**, `Compra` criada já `CONFIRMADA` com seus `ItemCompra`, `NfeDocument.statusEstoque=APLICADO`. **Não** altera `precoCustoCentavos`/`precoVendaCentavos`.

## Fila de revisão humana e histórico

| Método e caminho | Papel | Descrição |
|---|---|---|
| `GET /nfe/fila-revisao` | AUT | Filtros: `status` (padrão `ABERTO`), `motivo`, `severidade`, `documentoId`, paginação. |
| `POST /nfe/fila-revisao/:id/resolver` | GER | `{ decisao: "ACEITAR"\|"DISPENSAR", observacao ≥5 }`. Só motivos *aceitáveis* (divergências, dados fiscais incompletos, protocolo ausente, fonte não-XML, chave inválida/ausente, destinatário divergente, evento fiscal recebido, arquivo sem dados, falha de processamento, e-mail não classificado). **Não** aceitam dispensa manual: `FORNECEDOR_DESCONHECIDO`, `PRODUTO_DESCONHECIDO`, `PRODUTO_SUGERIDO_CONFIRMAR`, `EVENTO_FISCAL_CANCELAMENTO`, `FALHA_INTEGRACAO_ESTOQUE` (corrija o dado, rejeite o documento ou repita a operação) → `422`. |
| `GET /nfe/historico` | AUT | ProcessingLog. Filtros: `entidadeTipo`, `entidadeId`, `correlationId`, `status` (`OK`/`WARN`/`ERROR`), `pageSize` (≤200). |

Motivos gerados automaticamente: `FONTE_NAO_XML`, `CHAVE_INVALIDA`, `CHAVE_AUSENTE`, `FORNECEDOR_DESCONHECIDO`, `DESTINATARIO_DIVERGENTE`, `PROTOCOLO_AUSENTE`(alerta), `DIVERGENCIA_TOTAL_PRODUTOS`, `DIVERGENCIA_TOTAL_NOTA`(alerta), `PRODUTO_DESCONHECIDO`, `PRODUTO_SUGERIDO_CONFIRMAR`, `DIVERGENCIA_VALOR_ITEM`, `DADOS_FISCAIS_INCOMPLETOS`(alerta), `DIVERGENCIA_PRECO_CUSTO`(alerta), `UNIDADE_DIVERGENTE`(alerta), `EVENTO_FISCAL_CANCELAMENTO`, `EVENTO_FISCAL_RECEBIDO`(alerta), `EVENTO_FISCAL_SEM_NOTA`(alerta), `DIVERGENCIA_QUANTIDADE_RECEBIMENTO`(alerta, já nasce decidida), `FALHA_INTEGRACAO_ESTOQUE`, `ARQUIVO_SEM_DADOS`, `FALHA_PROCESSAMENTO`, `EMAIL_NAO_CLASSIFICADO`(alerta). Itens fechados automaticamente por reprocessamento (`resolucao` iniciando em `AUTO`) **reabrem** se a condição voltar; decisões humanas nunca reabrem.

## E-mail e OCR

| Método e caminho | Papel | Descrição |
|---|---|---|
| `GET /nfe/emails` | AUT | Mensagens ingeridas (≤100) com anexos. Filtros `status`, `categoria`. |
| `GET /nfe/email/status` | GER | Se a caixa está configurada por variáveis de ambiente e o que falta (nunca devolve segredos). |
| `POST /nfe/email/sincronizar` | ADM | Busca não lidos, ingere (dedupe por Message-ID e por SHA-256 do anexo), marca como processado **só depois** de gravar. `503` sem configuração; `502` com `ok:false` se a caixa estiver indisponível após 3 tentativas (espera 1 s, 2 s). |
| `GET /nfe/ocr/status` | GER | Se o OCR offline está configurado (`NFE_OCR_LANG_PATH`). |

## Variáveis de ambiente (nenhuma credencial é versionada)

`NFE_STORAGE_DIR` (originais; padrão `./nfe-storage`) · `NFE_OCR_LANG_PATH`, `NFE_OCR_LANG` (padrão `por`) · `NFE_TOLERANCIA_CENTAVOS` (1) · `NFE_LIMITE_VARIACAO_CUSTO_PCT` (10) · `LOJA_CNPJ` (já existente; confere o destinatário) · e-mail: `EMAIL_IMAP_HOST`, `EMAIL_IMAP_PORT`, `EMAIL_IMAP_USER`, `EMAIL_IMAP_AUTH` (`password`\|`oauth2`), `EMAIL_IMAP_PASSWORD`, `EMAIL_OAUTH_ACCESS_TOKEN`, `EMAIL_IMAP_MAILBOX`, `EMAIL_IMAP_PROCESSED_MAILBOX`, `EMAIL_ACCOUNT_LABEL`.
