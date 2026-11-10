# Integração NF-e / inteligência documental — Fase 5

Branch: `feat/nfe-ingestion-typescript` (**publicada no GitHub em 2026-11-10**, `origin/feat/nfe-ingestion-typescript`; PR em **Draft** com base `feat/metas-exportacao-backup-operacional`; **não mesclada** em nenhuma branch, `main` intocada, nenhum deploy feito). Stack: Node.js + Fastify 4 + TypeScript + Prisma 5 + SQLite + React/Vite. Documentos relacionados: [`nfe-api.md`](nfe-api.md) · [`nfe-pricing-contract.md`](nfe-pricing-contract.md) · [`nfe-ocr-report.md`](nfe-ocr-report.md) · [`nfe-migration.sql`](nfe-migration.sql).

## 1. Base e escopo

- **Base usada:** `fix/margem-cmv-fiscal` @ `31855e8` + B17 (`origin/feat/metas-exportacao-backup-operacional` @ `336c4a2`, mesclada localmente em `ebddbc5` com 1 conflito trivial em `apps/api/package.json`). **Não** foi mesclado nada na `main`; branches de terceiros intocadas.
- **Não existem nesta máquina** (verificado com `git cat-file`, reflog e busca em disco): a branch `feat/motor-precos-fiscal`, os commits `390252a` e `c73a88f`, o `motor-precos.ts` e o `status-consolidado-marquescolor.md`. O motor de preços e as regras tributárias **não foram tocados** (são de outra responsabilidade) e o contrato com eles foi escrito às cegas (`nfe-pricing-contract.md`).
- **Fora do escopo desta entrega:** cálculo de custo/markup/preço, regras tributárias, consulta à SEFAZ, validação de assinatura digital.

## 2. Fluxo e etapas (nunca misturadas)

```
e-mail / upload → arquivo original preservado (SHA-256) → identificação por assinatura
 → pipeline (XML > texto PDF > render PDF > OCR > multimodal opcional) → normalização
 → NfeDocument/NfeItem → fornecedor (CNPJ) → produtos (mapa) → divergências → fila de revisão humana
 → [humano] vincula/aceita → aprovar → [humano] confirmar recebimento físico → entrada em estoque
 → dados estruturados para o módulo de custo (fora daqui: custo atualizado → preço sugerido → preço aprovado)
```

| Etapa | Campo | Quem muda |
|---|---|---|
| documento recebido / interpretado | `DocumentoArquivo.status`, `NfeDocument.statusDocumento` | pipeline |
| conferido | `statusConferencia` (PENDENTE → EM_REVISAO → CONFERIDA / REJEITADA) | pipeline + humano |
| compra preparada | `statusCompra=PREPARADA` (sem pendência bloqueante, fornecedor e itens resolvidos) | pipeline |
| compra aprovada | `statusCompra=APROVADA` (+ `aprovadoPorId/Em`) | **humano** (GER) |
| mercadoria recebida fisicamente | `recebimentoFisicoEm/PorId`, `NfeItem.quantidadeRecebida` | **humano** (GER) |
| estoque atualizado | `statusEstoque=APLICADO`, `MovimentacaoEstoque`, `Compra` CONFIRMADA | módulo, só após as duas decisões acima |
| custo atualizado / preço aprovado | — | **não é deste módulo** |

## 3. Regras obrigatórias → onde estão e como são testadas

| Regra | Implementação | Teste |
|---|---|---|
| XML tem prioridade sobre OCR | `pipeline.ts` (ordem); `persistirExtracao` promove PDF/OCR → XML e **nunca** rebaixa | `XML prevalece sobre PDF/OCR` |
| Preservar o original | `armazenamento.ts` (gravado antes de processar, por SHA-256, `wx`); `GET …/original` | XML válido / falha de processamento |
| Duplicidade (chave, e-mail, anexo) | `chaveAcesso` único; `(emitente, modelo, série, nº)` único; `messageId` único; `sha256` único; Message-ID ausente → SHA-256 dos bytes (determinístico) | NF-e duplicada; duplicidade por Message-ID e anexo |
| Não cadastrar produto/fornecedor | não existe `create` de `Produto`/`Fornecedor` no módulo | fornecedor desconhecido; produto conhecido x desconhecido |
| Não inventar correspondência | só `ProdutoFornecedorMap` automático; GTIN exato = **sugestão** que exige confirmação; sem comparação por nome | produto desconhecido; GTIN sugere |
| Não atualizar custo/preço | nenhum `update` de custo/preço no módulo | fluxo completo (custo/preço intactos) |
| Não movimentar estoque antes de aprovação + recebimento | `confirmarRecebimento` exige `APROVADA`; estoque só em `aplicarEstoque` | estoque só depois de aprovação e recebimento |
| Sem `Compra` acionável antes do estoque | `Compra` só nasce `CONFIRMADA`, na mesma transação do estoque | fluxo completo (`/compras/:id/confirmar` recusado) |
| Extração por IA ≠ validação fiscal | multimodal marca `MULTIMODAL`, baixa confiança, sempre `FONTE_NAO_XML` | multimodal desligado por padrão |
| Preservar dados fiscais originais | `quantidadeOriginal`, `valorUnitarioOriginal` (texto), `impostosJson` (nós originais), `origemCamposJson`, XML original em disco | XML válido |
| Registrar decisões humanas | `ProcessingLog` + `Auditoria` + `ReviewQueueItem.resolvidoPorId/resolucao` | fluxo completo; revisão humana nunca reabre |

## 4. Modelos (Prisma, **aditivos**) — `apps/api/prisma/schema.prisma`

`EmailMensagem`, `DocumentoArquivo`, `NfeDocument`, `NfeItem`, `ProdutoFornecedorMap`, `ReviewQueueItem`, `ProcessingLog`. Nenhuma coluna/tabela existente foi alterada; só duas linhas de relação inversa (`Fornecedor.nfeDocumentos/produtoMaps`, `Produto.nfeItens/fornecedorMaps`) — **a coordenar com quem mexe nesses modelos**. JSON fica em `String` (SQLite/Prisma 5). `Compra` não ganhou FK: `NfeDocument.compraId` é texto sem relação. Dinheiro em centavos `Int`; quantidade/unitário em texto original + `Float`/centavos derivados.

Decisões de modelagem: `NfeDocument` guarda os estágios em campos separados (§2); `NfeItem.movimentacaoEstoqueId` é **único** (idempotência da entrada); `ReviewQueueItem` é único por `(entidadeTipo, entidadeId, motivo, ref)` (reprocessar não duplica).

## 5. Leitura do XML (decisões que importam)

`fast-xml-parser` 5.12.0 com `parseTagValue/parseAttributeValue=false` (a chave de 44 dígitos virava `float` e CNPJ/`cProd` perdiam zeros), `removeNSPrefix`, `isArray` para `det/detPag/dup/vol`, `processEntities=false` + rejeição prévia de `<!DOCTYPE`/`<!ENTITY` (sem XXE/“billion laughs”) e decodificação própria das 5 entidades predefinidas. Aritmética decimal exata com `BigInt` (`decimal.ts`), nunca `parseFloat`. Chave: 44 dígitos + DV módulo 11 + coerência com CNPJ/modelo/série/nº/cUF (`chave.ts`). Reconhece `nfeProc`, `NFe`, `resNFe` (resumo sem itens → revisão) e eventos (`procEventoNFe`: cancelamento bloqueia o recebimento; demais geram alerta).

**Limites:** não valida assinatura digital, não confere o XSD, **não consulta a SEFAZ** (nota cancelada/denegada só é detectada se o XML de evento chegar). O protocolo `nProt` é apenas registrado.

## 6. Divergências e parâmetros

| Motivo | Sev. | Regra | Parâmetro |
|---|---|---|---|
| `DIVERGENCIA_VALOR_ITEM` | bloq. | `|qCom×vUnCom − vProd| > tolerância` | `NFE_TOLERANCIA_CENTAVOS`=1 |
| `DIVERGENCIA_TOTAL_PRODUTOS` | bloq. | `|Σ itens − vProd(total)| > tolerância` | idem |
| `DIVERGENCIA_TOTAL_NOTA` | alerta | `vNF ≠ prod − desc + frete + seg + outras + IPI + ST` (pode faltar II/FCP) | idem |
| `DIVERGENCIA_PRECO_CUSTO` | alerta | unitário da NF vs custo atual do produto (informativo) | `NFE_LIMITE_VARIACAO_CUSTO_PCT`=10 |
| `UNIDADE_DIVERGENTE` | alerta + trava no recebimento | unidade da NF ≠ unidade do produto | — |
| `DESTINATARIO_DIVERGENTE` | bloq. | CNPJ destinatário ≠ `LOJA_CNPJ` | — |
| `DADOS_FISCAIS_INCOMPLETOS` | alerta | falta NCM, CFOP ou CST/CSOSN | — |
| `PROTOCOLO_AUSENTE` | alerta | XML sem `protNFe` | — |
| quantidade no recebimento | decidida no ato | recebida ≠ NF ⇒ `motivoDivergencia` obrigatório | — |

## 7. E-mail (recebimento)

- **Arquitetura:** porta `EmailSource` (`email/tipos.ts`); implementação IMAP (`imapflow`) com `password` **ou** `oauth2` (XOAUTH2); leitura de RFC 822 via `mailparser`; classificação heurística por palavras-chave (porte do `email_classifier.py`; **não é IA**); anexos por assinatura; duplicidade por Message-ID e por SHA-256; falha ao marcar como lido não perde dados; falha de um e-mail não derruba os demais; indisponibilidade → 3 tentativas com espera crescente → `ok:false` e nada processado. Marcar como processado **só depois** de gravar; copia para pasta de processados, **nunca apaga** o original.
- **Credenciais:** somente variáveis de ambiente (lista em `nfe-api.md`); nada versionado, nada em log. `GET /nfe/email/status` lista só os **nomes** que faltam.
- **Outlook / Microsoft (avaliação, com fontes oficiais consultadas em 2026-11-10):**
  - “Authenticate an IMAP, POP or SMTP connection using OAuth” — afirma suporte a OAuth2 para IMAP/POP/SMTP **em Microsoft 365 e Outlook.com**: <https://learn.microsoft.com/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth>
  - “Deprecation of Basic authentication in Exchange Online” — Basic removido de IMAP/POP/EWS etc. para tenants Microsoft 365: <https://learn.microsoft.com/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online>
  - Para contas **pessoais Outlook.com** as fontes oficiais encontradas são datadas/ambíguas (o aviso de 2021 diz que a mudança afetava o comercial, não o consumidor); respostas **não oficiais** no Microsoft Q&A (2025–2026) relatam que senha/“senha de app” **não** autentica em IMAP e que é preciso OAuth2. **Conclusão prática:** não contar com usuário+senha; usar **OAuth2 (registro de aplicativo no Microsoft Entra, escopo IMAP, token de curta duração via `EMAIL_OAUTH_ACCESS_TOKEN`/`tokenProvider`)** ou **Microsoft Graph** (`/me/messages` + anexos; alternativa mais limpa, ainda **não implementada**).
  - A conta do projeto citada no backend Python (`marquescolor@outlook.com`) **não foi acessada** e nenhum endereço/credencial foi inventado.
- **ESTADO:** a integração Outlook/IMAP **NÃO está concluída**: o código só foi exercitado com `.eml` sintéticos e fontes simuladas. Falta teste de recebimento real com autorização e credenciais válidas do dono da conta.

## 8. Reaproveitamento (`feature/email-stock-backend`, Python) — o que foi portado

| Arquivo Python | Destino TS | Decisão |
|---|---|---|
| `nfe_parser.py` | `nfe/xml-parser.ts` | Portado e ampliado (CST/CSOSN, CEST, impostos por item, duplicatas, protocolo, eventos). Corrigido: sem coerção numérica, sem XXE |
| `matching.py` | `nfe/matching.ts` | Regra mantida (mapa por código do fornecedor; sem fuzzy). GTIN só sugere |
| `email_classifier.py` | `email/classificador.ts` | Portado (palavras-chave) |
| `email_source.py` | `email/eml.ts`, `email/imap.ts` | Portado; Message-ID ausente agora determinístico (o original usava `id()`) |
| `ingest.py` | `nfe/ingestao.ts`, `email/ingestao-email.ts` | Fluxo mantido; **removido**: criação automática de fornecedor e entrada em estoque no ingest |
| `stock.py` | `nfe/servico.ts` (`estoqueGatewayPadrao`) | Só a ideia de razão de estoque; movimento só após aprovação+recebimento |
| `worker.py` | `POST /nfe/email/sincronizar` | Polling contínuo **não** portado (sincronização sob demanda; agendamento = pendência) |
| `review_queue`, `processing_logs` | `ReviewQueueItem`, `ProcessingLog` | **Não existiam** no Python (só nomes na tarefa); projetados do zero |
| `models.py`, FastAPI, Alembic, Docker | — | **Não portados** (stack é Node) |

**Open source avaliado** (consulta `npm view` em 2026-11-10; licenças verificadas): fast-xml-parser 5.12.0 (MIT, atualizado 2026-11-03), @fastify/multipart 8.3.1 (MIT; linha compatível com Fastify 4), pdfjs-dist 5.6.205 (Apache-2.0; **ver aviso de segurança §10**), @napi-rs/canvas 0.1.100 (MIT), tesseract.js 7.0.0 (Apache-2.0; última publicação 2025-12-15) + dados `tessdata_fast` (Apache-2.0), imapflow 2.11.0 (MIT), mailparser 3.14.3 (MIT), @types/mailparser 3.9.0 (MIT). `unpdf` descartado (exige Node ≥ 24); `pdf-parse`/`sharp` não necessários. **“Reversa do Sandeco” não foi avaliado** (nenhuma instalação/download feita; fica como opção se o usuário autorizar). Nenhum código de terceiros foi copiado — só dependências via npm.

## 9. Parâmetros que dependem do contador / decisão de negócio (não decididos aqui)

1. Tolerância de centavos entre totais (`NFE_TOLERANCIA_CENTAVOS`) e o que o contador aceita como "arredondamento".
2. Limite de variação de custo que merece alerta (`NFE_LIMITE_VARIACAO_CUSTO_PCT`).
3. Quais **CFOPs** representam compra para revenda e quais (devolução, remessa, bonificação, demonstração, transferência) devem ir para revisão — hoje **nenhum CFOP bloqueia**.
4. Regime tributário da **loja** e uso de crédito de ICMS/PIS/COFINS — este módulo só entrega o CRT do **emitente**.
5. Rateio de frete, seguro, outras despesas e desconto no custo; tratamento de IPI e ICMS-ST.
6. Conversão de embalagens (CX→UN) e cadastro do fator.
7. Prazo/regra para tratar notas sem protocolo ou eventualmente canceladas (exige consulta à SEFAZ — **não implementada**).
8. Retenção legal do XML original (prazo de guarda) e política de backup do `NFE_STORAGE_DIR`.

## 10. Segurança, riscos e pendências

- **Segredos:** nenhum no repositório; `.env` da loja **nunca aberto**; o runner de testes ignora `.env` (`NODE_ENV=test`).
- **`pdfjs-dist` 5.6.205 — alto no `npm audit`** (CVE-2026-16633, execução de JS ao abrir PDF malicioso com `enableScripting` + sem CSP; afeta o *viewer*; este módulo usa só a API headless). Correção em `≥ 6.2.108` exige Node ≥ 22.13 (o projeto declara `>=20.6` e o CI usa Node 20). **Decisão pendente.** Também no baseline (não introduzidos por esta fase): `fastify`/`find-my-way` (alto), `zod` (alto), `fast-jwt` via `@fastify/jwt` (**crítico**), `react-router` (moderado) — recomendado tratar em PR separado.
- **`/compras/:id/confirmar` e `POST /compras`** atualizam `precoCustoCentavos` automaticamente (código existente) — risco para a regra “nenhuma atualização automática de preço”; ver `nfe-pricing-contract.md` §4.2.
- **Sem testes com documentos fiscais reais**, sem acurácia de OCR em volume, sem teste IMAP/Outlook real, **sem consulta à SEFAZ**.
- **UI:** `DocumentosFiscais.tsx` compila (`vite build` OK) mas **não foi inspecionada visualmente nem testada em navegador**. O item de menu só aparece para ADMIN/GERENTE, mas a **rota `/documentos-fiscais` não tem guarda de papel no front** (a API é quem recusa escrita a VENDEDOR/CAIXA com 403; leituras `GET /nfe/*` são liberadas a qualquer usuário autenticado, por desenho). O upload usa `fetch` direto e **não renova token expirado** (após ~15 min pode falhar com 401 até recarregar/logar de novo).
- **Node:** `pdfjs-dist@5.6.205` pede Node ≥ 20.19; `engines` raiz diz `>=20.6`.
- **Backup:** o JSON de backup guarda **metadados + SHA-256** das NF-e, **não os arquivos originais** — copiar `NFE_STORAGE_DIR` junto.
- Agendamento da leitura de e-mail (cron/serviço do Windows) e polling não implementados.

## 11. Banco, migração e implantação (proposta — nada aplicado)

O projeto usa `prisma db push` (sem pasta de migrações). O diff entre o schema da base (`ebddbc5`) e o atual foi gerado com `prisma migrate diff` e está em [`nfe-migration.sql`](nfe-migration.sql): **7 `CREATE TABLE` + 21 índices; nenhum `ALTER`/`DROP`/`UPDATE`** em tabelas existentes (as únicas "ON UPDATE" no arquivo são cláusulas de FK das tabelas novas).

Procedimento no Windows (loja):
1. **Parar** a API. Fazer backup: copiar o arquivo `.db` e o diretório `NFE_STORAGE_DIR` (se existir) para fora da pasta do sistema; exportar também o JSON em *Backup*. Conferir tamanho/abertura da cópia.
2. Ler `nfe-migration.sql` (revisão) e, preferencialmente, **ensaiar em uma cópia** do `.db` (`DATABASE_URL` apontando para a cópia).
3. Aplicar com `npm run db:push -w apps/api` **sem** `--accept-data-loss` (o diff é só aditivo; se o Prisma pedir perda de dados, **abortar**).
4. Verificar: `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('NfeDocument','NfeItem','EmailMensagem','DocumentoArquivo','ProdutoFornecedorMap','ReviewQueueItem','ProcessingLog');` → 7 linhas; contagens das tabelas antigas inalteradas; `npm run build` e smoke test (login, uma venda de teste cancelada, tela Documentos fiscais).
5. Configurar `NFE_STORAGE_DIR` (fora de pastas sincronizadas/temporárias) e, se for usar OCR, `NFE_OCR_LANG_PATH`. **Não** configurar e-mail em produção antes do teste real autorizado.
6. **Rollback:** parar a API, restaurar o `.db` copiado no passo 1 (as tabelas novas somem junto) e voltar o código anterior. Restaurar JSON de backup antigo também funciona (tabelas de NF-e são opcionais e limpas sem violar FK — testado).
7. Checklist de aceite: build ok; suíte ok (§12); tela abre para ADMIN/GERENTE e não aparece para VENDEDOR/CAIXA; upload de um XML **de teste** gera documento; aprovação não muda saldo; recebimento muda saldo **uma vez**; backup exporta/restaura.

Cuidado: as tabelas novas usam `ON DELETE RESTRICT` de `ProdutoFornecedorMap` → `Produto/Fornecedor`; excluir **fisicamente** um produto/fornecedor com mapa falhará (exclusão lógica por `ativo` não é afetada).

## 12. Testes (um único `node scripts/run-tests.mjs`, banco SQLite isolado e descartável)

| Arquivo | Testes | Cobre |
|---|---|---|
| `auth/health/produtos/features/browser-services` (existentes) | 38 | baseline B17 + fiscal |
| `nfe-xml` | 5 | decimais exatos, chave/DV, XML válido/inválido/XXE/resumo/evento |
| `nfe-fluxo` | 22 | fluxo HTTP completo, duplicidade, fornecedor/produto, GTIN, divergências, aprovação, recebimento, falha de estoque + retentativa, unidade, eventos, reprocessamento, falha de processamento + recuperação, autorização |
| `nfe-documentos` | 11 | PDF digital, PDF escaneado, multi-página, JPG, PNG, assinatura x extensão, OCR ausente, idioma ausente sem rede, XML sobre OCR, chave inválida, multimodal, **OCR real** |
| `nfe-email` | 12 | `.eml`, Message-ID, duplicidade, classificação, anexos ignorados, indisponibilidade/retentativas, marcar falha, configuração, endpoints |
| `nfe-backup` | 3 | ida e volta com NF-e, backup antigo, tabelas obrigatórias |

**Resultado de uma única execução integrada (2026-11-10):** `91 testes — 91 pass, 0 fail` com os dados locais de OCR (`apps/api/ocr-data`); `91 testes — 90 pass, 0 fail, 1 skipped` sem eles (modo CI: o teste de OCR real fica *skipped*). Builds: `npm run build` (API `tsc` + web `vite build`) OK. Baseline antes da Fase 5 na mesma base: 38/38. As contagens **não** somam suítes isoladas.

Como rodar: `npm test -w apps/api` (usa `scripts/run-tests.mjs`: cria `apps/api/prisma/.test-db/test-*.db`, aplica o schema só nele, **não lê o `.env` da loja** e imprime o caminho do banco antes de começar).

## 13. Status do PR e pendências para sair de Draft

**PR:** *Draft*, origem `feat/nfe-ingestion-typescript`, base `feat/metas-exportacao-backup-operacional` (B17, PR #1). O diff contra essa base contém **8 commits** (`31855e8`, `ebddbc5`, `1c0ad17`, `69db00f`, `ab7caf7`, `ba5703b`, `e11bac4` e este de documentação) — 53 arquivos, sem contar o `package-lock.json`. Não deve ser marcado como pronto para integração enquanto houver pendência abaixo. **Não** mesclar, **não** fazer deploy, **não** tocar na `main`.

**Pendências bloqueantes para "pronto para integração":**

1. **Contrato com o motor de preços NÃO validado.** `nfe-pricing-contract.md` foi escrito só a partir do que a Fase 5 produz. O código real do motor (GLM: `motor-precos.ts`, `390252a`, `c73a88f`) **não esteve acessível** nesta máquina e **nenhum teste de integração com ele existe**. Tratar o contrato como *proposta* até o GLM revisá-lo e confirmar o formato real.
2. **Node.js × `pdfjs-dist` e CVE-2026-16633.** `pdfjs-dist@5.6.205` aparece como **alto** no `npm audit` (CVE-2026-16633 / GHSA-hq66-cqwq-w95j; afeta o *viewer* com `enableScripting` e sem CSP; este módulo usa só a API headless). A versão corrigida (`≥ 6.2.108`) exige **Node ≥ 22.13**, enquanto o projeto declara `>=20.6` e o CI usa **Node 20**; a 5.6.205 exige Node ≥ 20.19. **Decisão pendente:** subir Node/CI e atualizar o pdfjs (recomendado) ou aceitar formalmente o risco residual. Ainda não verificado se o `pdfjs-dist` 6.x funciona com `@napi-rs/canvas` 0.1.100 (a combinação com canvas 1.1.0 + pdfjs 5.6.205 derrubava o processo).
3. **Testes que ainda faltam (não executados):**
   - **Outlook real:** recebimento real de e-mail (IMAP com OAuth2/XOAUTH2 ou Microsoft Graph) com autorização do dono da conta e credenciais válidas. Hoje só há `.eml` sintéticos e fontes simuladas; Microsoft Graph não foi implementado.
   - **Documentos fiscais reais:** XML/DANFE/PDF/foto reais (anonimizados), incluindo acurácia do OCR em volume. Hoje só fixtures sintéticas.
   - **Consulta à SEFAZ:** situação real da nota (autorizada/cancelada/denegada) e assinatura digital **não são validadas**; a detecção de cancelamento só ocorre se o XML de evento chegar.
   - Inspeção visual / teste em navegador da tela *Documentos fiscais* (só compilação foi verificada).
4. **Parâmetros do contador** (§9) e decisão sobre o risco de custo automático em `/compras/:id/confirmar` e `POST /compras` (código preexistente).
5. Vulnerabilidades preexistentes no baseline (`fast-jwt` crítico via `@fastify/jwt`, `fastify`, `zod`, `react-router`), a tratar em PR separado.
