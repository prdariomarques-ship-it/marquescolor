# Relatório — recuperação do OCR (causas e correções)

Data: 2026-11-10 · Autor: sessão Fase 5 (NF-e / inteligência documental)

## 1. Resumo honesto

- **Não existe código de OCR em nenhuma referência acessível** do repositório: busca por `ocr|tesseract|gemini|multimodal|pdfjs|vision` em `main`, `fix/margem-cmv-fiscal`, `origin/feat/metas-exportacao-backup-operacional` e `origin/feature/email-stock-backend` só encontrou (a) o arquivo `.env.example` da branch Python com um *placeholder* `GEMINI_API_KEY` de um template de app Vite e (b) falsos positivos (`revision` do Alembic). O README/HANDOFF não cita OCR.
- Portanto **a causa real da parada do OCR relatada pelo usuário NÃO pôde ser diagnosticada**: o código/serviço que parou não está nesta máquina. **Nada abaixo é uma causa comprovada da parada original.**
- O que foi feito: o pipeline OCR foi **construído do zero**, de ponta a ponta, e durante a construção foram **reproduzidas duas falhas reais de compatibilidade** que *poderiam* parar um OCR/leitor de PDF em Node (são hipóteses plausíveis para quem investigar o sistema original, não conclusões).

## 2. Falhas reais reproduzidas e corrigidas

| # | Sintoma observado | Causa (comprovada neste ambiente) | Correção |
|---|---|---|---|
| 1 | Processo Node **morre sem mensagem** (código de saída `3221225477` = `0xC0000005`, violação de acesso) ao renderizar a página de um PDF escaneado | `@napi-rs/canvas` **1.1.0** é incompatível com `pdfjs-dist` **5.6.205** (que declara `^0.1.96`); a falha é nativa e só aparece em páginas com **imagem** (página só com texto renderiza). | `@napi-rs/canvas` fixado em **0.1.100** (exato) em `apps/api/package.json`. Reproduzido e verificado: render passa. |
| 2 | `SyntaxError: Unexpected identifier 'source'` ao criar o worker do `tesseract.js` 7 em Node 22 | A dependência transitiva `wasm-feature-detect` resolveu para **1.10.0**, que usa `import.source(...)` (sintaxe não suportada pelo Node 22 nem pelo esbuild/tsx); o `^1.8.0` do tesseract aceita 1.10. | `wasm-feature-detect` fixado em **1.8.0** (dependência direta exata em `apps/api`, hoisted). Verificado com `npm ls`: uma única cópia 1.8.0. |

Outras decisões de robustez (preventivas, não corrigem um defeito observado):

- **OCR 100% offline**: `tesseract.js` por padrão baixa dados de idioma da rede. O motor (`documentos/ocr.ts`) exige o arquivo local (`NFE_OCR_LANG_PATH/<idioma>.traineddata`) e falha com `OcrIndisponivelError` **antes** de criar o worker se ele não existir — nunca tenta download. (Teste automatizado cobre isso.)
- **Etapas isoladas e registradas**: identificação por assinatura → XML → texto nativo de PDF → renderização → OCR → multimodal (opcional) → normalização. Falha de uma etapa vira `ETAPA_*` com `WARN` no `ProcessingLog` e o arquivo segue para revisão humana; **o original é sempre preservado** e pode ser **reprocessado** (`POST /api/nfe/arquivos/:id/reprocessar`).
- **Persistência**: o arquivo é gravado em `NFE_STORAGE_DIR` (endereçado por SHA-256) **antes** de qualquer processamento; falha inesperada marca `DocumentoArquivo.status=FALHA` + pendência `FALHA_PROCESSAMENTO` em vez de perder o arquivo.
- `isEvalSupported:false` no `getDocument` do pdfjs e limites de 30 páginas / 15 MB / 5 MB para XML.

## 3. Mapeamento pedido → o que existe

| Ponto a investigar (pedido) | Situação |
|---|---|
| upload | `POST /api/nfe/upload` (multipart, 15 MB, 10 arquivos) — implementado e testado |
| MIME | **ignorado como fonte de verdade**; tipo por assinatura (`classificador.ts`); teste: PNG renomeado `.xml` segue o caminho de imagem |
| conversão de PDF / renderização de páginas | `pdf.ts` (pdfjs-dist + @napi-rs/canvas), escala 2.5 (~180 dpi) — testado, inclusive PDF de 3 páginas |
| OCR | `ocr.ts` (tesseract.js, `por.traineddata` *fast*, offline) — testado de verdade (ver §4) |
| extração de texto | PDF nativo (`pdf.ts`) + interpretação de DANFE (`danfe-texto.ts`) |
| multimodal | **porta** `MotorMultimodal` existe e é **desligada por padrão**; nenhum provedor foi integrado; a saída é marcada `MULTIMODAL`, confiança baixa e sempre exige revisão |
| tratamento de erros / persistência | ver §2 |

## 4. O que foi realmente executado (sem exagero)

- **OCR real**: `tesseract.js` 7.0.0 + `por.traineddata` (tessdata_fast, 1 982 756 bytes, SHA-256 `c4932b93…b7deb`, Apache-2.0, baixado **uma vez** com autorização do usuário para `apps/api/ocr-data/`, fora do git) sobre **imagens sintéticas** geradas por `@napi-rs/canvas`, e sobre um **PDF escaneado sintético** (imagem JPEG embutida) passando por render → OCR. Teste `OCR REAL` passou.
- **Qualidade observada**: o OCR leu corretamente "VALOR TOTAL DA NOTA 125,00", mas **errou dígitos** noutra linha (`CNPJ 11.222.888/0001-8` em vez de `11.222.333/0001-81`; `EMISSAD` por `EMISSAO`). **Conclusão de projeto:** OCR nunca é fonte confiável. Por isso dados de OCR/PDF **sempre** geram `FONTE_NAO_XML` (bloqueante), a chave de acesso passa por DV módulo 11 e o CNPJ/nº/série são derivados da **chave** quando ela valida.
- **Não** foram testados documentos fiscais reais, DANFEs reais, fotos de celular, escaneamentos ruins, nem acurácia em volume. Todas as fixtures são sintéticas/anonimizadas (CNPJs fictícios com DV válido).
- Os demais testes de OCR/PDF usam **motor de OCR falso** (injeção) para testar a lógica do pipeline; isso é dito explicitamente nos testes.
- **Inspeção visual**: não foi feita (nem do OCR, nem da UI).

## 5. Como habilitar / verificar

```bash
# dados de idioma (uma vez; 1,98 MB; Apache-2.0): https://github.com/tesseract-ocr/tessdata_fast
#   salvar como apps/api/ocr-data/por.traineddata  (diretório ignorado pelo git)
set NFE_OCR_LANG_PATH=C:\caminho\apps\api\ocr-data      # Windows (ou export no Linux)
npm test -w apps/api                                     # o runner habilita o teste de OCR real se o arquivo existir
```

`GET /api/nfe/ocr/status` informa se está configurado. Sem o arquivo, PDFs escaneados/imagens viram `SEM_DADOS` com a causa registrada (etapa `OCR: FALHA — motor de OCR nao configurado`) e pendência de revisão; nada quebra.

## 6. Dependências de segurança relevantes

`pdfjs-dist@5.6.205` consta em `npm audit` como **alto** (GHSA-hq66-cqwq-w95j / CVE-2026-16633: execução de JS ao abrir PDF malicioso **quando `enableScripting` está ativo e não há CSP**, i.e., no *viewer* de navegador). Este módulo usa só a API *headless* em Node (texto + render), sem *viewer*/scripting. A correção upstream está em `pdfjs-dist ≥ 6.2.108`, que exige Node ≥ 22.13; o `engines` do projeto é `>=20.6` e o CI usa Node 20. **Decisão pendente do usuário:** subir o Node/CI e atualizar o pdfjs (recomendado) ou aceitar o risco residual documentado. Ver `nfe-ingestion.md` §10.
