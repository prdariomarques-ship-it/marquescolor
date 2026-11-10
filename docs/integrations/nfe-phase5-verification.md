# Fase 5 — verificação de segurança e qualidade (2026-11-10)

Ambiente de execução desta verificação: **Windows 11 + Node 22.23.2**, worktree `C:\Users\dario\marquescolor-nfe-wt`, SQLite isolado e descartável (`apps/api/prisma/.test-db/`). Reproduzida também em **container Linux** (`node:22-bookworm-slim`, Debian 12, Node 22.23.4, cópia gravável do commit `f1e7d94`, `npm ci` + build + suíte; ver §4). **Não** foi executada na VPS nem com Poppler.

| Ponto pedido | Resultado | Evidência (testes em `apps/api/test/`) |
|---|---|---|
| Preservação do documento original | OK | `nfe-fluxo`: XML válido (download byte a byte idêntico); original gravado **antes** de processar (`armazenamento.ts`, `wx`, endereçado por hash); falha de processamento preserva o arquivo |
| SHA-256 e idempotência | OK | `nfe-fluxo`: NF-e duplicada, reprocessamento idempotente; `nfe-seguranca`: reenvio ×4 não cria arquivo/documento/movimento; **original adulterado → reprocessar recusa com 409** (verificação de SHA-256) |
| XML malicioso | OK | `nfe-xml`/`nfe-seguranca`: `DOCTYPE`/`ENTITY` (bilhão de risadas e XXE `file://`) rejeitados **antes** do parse; XML > 5 MB rejeitado; aninhamento de 20 000 níveis vira falha registrada (não derruba o processo); `processEntities=false` |
| PDF e imagem | OK (sintéticos) | `nfe-documentos`: PDF digital, escaneado, 3 páginas, JPG, PNG, tipo por assinatura (não por extensão) |
| OCR português | OK com ressalva de ferramenta | Teste **real** `tesseract.js` 7 + `por.traineddata` (tessdata_fast), offline, sobre imagem e PDF escaneado sintéticos; sem idioma local → falha explícita sem rede. **Ferramenta diferente da pedida:** usa **tesseract.js + pdfjs-dist + @napi-rs/canvas**, **não** o binário Tesseract nem **Poppler** (`pdftoppm`/`pdftotext`). Não foi testado Poppler |
| Revisão humana | OK | fila `ReviewQueueItem`, motivos não dispensáveis, decisão com observação e usuário; itens automáticos reabrem, humanos não |
| Logs e rastreabilidade | OK | `ProcessingLog` por etapa + `Auditoria` + `correlationId`; `historico` no detalhe |
| Recebimento físico | OK | etapa separada, quantidades por item, divergência/unidade exigem justificativa; recebimento integral recusado com unidade divergente |
| Prevenção de duplicidade no estoque | OK | `movimentacaoEstoqueId` único por item; compare-and-set do estoque e do recebimento dentro da transação; teste com 6 chamadas simultâneas → estoque sobe **uma** vez. **Ressalva honesta:** o mesmo teste também passava **sem** o compare-and-set (o Prisma/SQLite serializa as chamadas nesse cenário), logo ele comprova a ausência de duplicação, **não** isola a proteção contra corrida em outro banco/driver |
| Separação aprovação da NF × custo | OK | `nfe-fluxo`: custo e preço intactos após aprovação **e** após recebimento; `Compra` só nasce `CONFIRMADA` junto do estoque; `/compras/:id/confirmar` posterior é recusado |

## 1. Sobre os "17 testes específicos de OCR" citados

Os 17 testes de OCR aprovados em outro ambiente **não** puderam ser localizados nem reproduzidos aqui. Neste repositório os testes de OCR/PDF/imagem são **11** (`nfe-documentos.test.ts`, 1 deles é OCR real), mais 4 de segurança. Não somar nem equiparar as duas contagens.

## 2. Pendência de segurança — `pdfjs-dist`, Node.js e CVE-2026-16633

- `pdfjs-dist@5.6.205` (alto no `npm audit`; **CVE-2026-16633**, GHSA-hq66-cqwq-w95j): execução de JavaScript ao abrir PDF malicioso quando o `enableScripting` está ativo e não há CSP — cenário do *viewer* em navegador. Este módulo usa só a API headless (texto + render).
- Correção upstream: `pdfjs-dist ≥ 6.2.108`, que exige **Node ≥ 22.13**. O projeto declara `engines.node >= 20.6` e o CI usa **Node 20**; `5.6.205` já exige Node ≥ 20.19.
- **Decisão pendente do usuário:** subir Node/CI e atualizar (recomendado) ou aceitar formalmente o risco residual. Compatibilidade de `pdfjs-dist` 6.x com `@napi-rs/canvas` 0.1.100 **não foi testada** (a combinação canvas 1.1.0 + pdfjs 5.6.205 derrubava o processo ao renderizar imagens).
- Baseline com outras vulnerabilidades (`fast-jwt` crítico via `@fastify/jwt`, `fastify`, `zod`, `react-router`) — fora do escopo, tratar em PR separado.

## 3. O que NÃO foi feito (e por quê)

- **Baselines `fbd7cad`, containers Linux e inventário das 40 alterações de `/opt/ship-it`; recuperação dos 38 arquivos / branch `integration/ocr-pdv-additive` / merge `c23e7a3`:** pertencem ao repositório **ship-it / Dario OS**, que **não é este projeto** e que esta sessão está proibida de tocar (`C:\Users\dario\FlowCore\ship-it`, `C:\Users\dario\ship-it`); a VPS também não é acessível daqui. Nenhum desses commits existe neste repositório (`git cat-file` falha para `fbd7cad`, `c23e7a3`, `c011f4a`). Precisam ser conduzidos pela sessão que já tem esse contexto/autorização.
- Teste de Outlook/IMAP real, documentos fiscais reais, SEFAZ: pendentes (ver `nfe-ingestion.md` §13).

## 4. Reprodução em container Linux (2026-11-10, autorizada pelo usuário)

Imagem `node:22-bookworm-slim` (digest `sha256:5ec23b7c622b…`), cópia **gravável** do repositório (clone do commit `f1e7d94`, fora do worktree), `apt-get install openssl ca-certificates` (necessário ao Prisma), `npm ci`, `prisma generate`, `npm run build` (API + web), `npm test -w apps/api` com banco SQLite isolado e dados locais de OCR.

| Cenário | Resultado |
|---|---|
| Linux **sem** fontes de sistema | 95 testes: **94 pass, 0 fail, 1 skipped** (OCR real) |
| Linux **com** `fonts-dejavu-core` | 95 testes: **95 pass, 0 fail** (inclui OCR real sobre imagem e PDF escaneado) |
| Windows 11 (referência) | 95/95 |

Achado real da execução em Linux: **na primeira rodada o teste de OCR real falhou** (94/95) porque a imagem `slim` não tem fontes de sistema e o `@napi-rs/canvas` desenhou o texto **em branco** — problema do *fixture* de teste, não do OCR/produto (com `fonts-dejavu-core` os 11 testes passam). O teste agora detecta a ausência de fontes e fica `skipped` com a causa explícita. Documentos reais não sofrem disso (já trazem imagem/texto). Build, `npm ci` e o restante da suíte passaram nos dois cenários. Não foi usado Poppler nem o binário Tesseract.
