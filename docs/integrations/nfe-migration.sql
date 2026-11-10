-- CreateTable
CREATE TABLE "EmailMensagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "conta" TEXT,
    "remetente" TEXT NOT NULL,
    "remetenteNome" TEXT,
    "destinatario" TEXT,
    "assunto" TEXT,
    "recebidoEm" DATETIME NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    "confianca" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "erro" TEXT,
    "origemHandle" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" DATETIME
);

-- CreateTable
CREATE TABLE "DocumentoArquivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT,
    "origem" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "tipoDetectado" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "metodoExtracao" TEXT,
    "erro" TEXT,
    "usuarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentoArquivo_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "EmailMensagem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NfeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "arquivoId" TEXT,
    "emailId" TEXT,
    "chaveAcesso" TEXT,
    "chaveValida" BOOLEAN NOT NULL DEFAULT false,
    "modelo" TEXT,
    "serie" TEXT,
    "numero" TEXT,
    "naturezaOperacao" TEXT,
    "dataEmissao" DATETIME,
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "emitenteFantasia" TEXT,
    "emitenteIe" TEXT,
    "emitenteCrt" TEXT,
    "emitenteUf" TEXT,
    "destinatarioCnpj" TEXT,
    "destinatarioNome" TEXT,
    "fornecedorId" TEXT,
    "valorProdutosCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorFreteCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorSeguroCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorDescontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorOutrasCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorIcmsCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorIcmsStCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorIpiCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorPisCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorCofinsCentavos" INTEGER NOT NULL DEFAULT 0,
    "valorTotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "pagamentoJson" TEXT,
    "protocoloAutorizacao" TEXT,
    "fonteDados" TEXT NOT NULL,
    "origemCamposJson" TEXT,
    "confianca" REAL NOT NULL DEFAULT 0,
    "statusDocumento" TEXT NOT NULL DEFAULT 'INTERPRETADO',
    "statusConferencia" TEXT NOT NULL DEFAULT 'PENDENTE',
    "statusCompra" TEXT NOT NULL DEFAULT 'NAO_PREPARADA',
    "statusEstoque" TEXT NOT NULL DEFAULT 'NAO_APLICADO',
    "compraId" TEXT,
    "aprovadoPorId" TEXT,
    "aprovadoEm" DATETIME,
    "rejeitadoPorId" TEXT,
    "rejeitadoEm" DATETIME,
    "recebimentoFisicoPorId" TEXT,
    "recebimentoFisicoEm" DATETIME,
    "estoqueAtualizadoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "NfeDocument_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "DocumentoArquivo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NfeDocument_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "EmailMensagem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NfeDocument_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NfeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentoId" TEXT NOT NULL,
    "numeroItem" INTEGER NOT NULL,
    "codigoFornecedor" TEXT,
    "gtin" TEXT,
    "descricao" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "origemMercadoria" TEXT,
    "cst" TEXT,
    "csosn" TEXT,
    "unidade" TEXT,
    "unidadeTributavel" TEXT,
    "quantidadeOriginal" TEXT NOT NULL,
    "quantidade" REAL NOT NULL,
    "valorUnitarioOriginal" TEXT NOT NULL,
    "valorUnitarioCentavos" INTEGER NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "freteCentavos" INTEGER NOT NULL DEFAULT 0,
    "seguroCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "outrasCentavos" INTEGER NOT NULL DEFAULT 0,
    "icmsCentavos" INTEGER NOT NULL DEFAULT 0,
    "icmsStCentavos" INTEGER NOT NULL DEFAULT 0,
    "ipiCentavos" INTEGER NOT NULL DEFAULT 0,
    "pisCentavos" INTEGER NOT NULL DEFAULT 0,
    "cofinsCentavos" INTEGER NOT NULL DEFAULT 0,
    "impostosJson" TEXT,
    "origemDados" TEXT NOT NULL,
    "produtoId" TEXT,
    "statusVinculo" TEXT NOT NULL DEFAULT 'SEM_CORRESPONDENCIA',
    "vinculoOrigem" TEXT,
    "vinculoPorId" TEXT,
    "quantidadeRecebida" REAL,
    "movimentacaoEstoqueId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NfeItem_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "NfeDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NfeItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProdutoFornecedorMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fornecedorId" TEXT NOT NULL,
    "codigoFornecedor" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProdutoFornecedorMap_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProdutoFornecedorMap_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentoId" TEXT,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "severidade" TEXT NOT NULL DEFAULT 'BLOQUEANTE',
    "detalhe" TEXT,
    "dadosJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "resolucao" TEXT,
    "resolvidoPorId" TEXT,
    "resolvidoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProcessingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "correlationId" TEXT NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT,
    "acao" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,
    "detalheJson" TEXT,
    "usuarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMensagem_messageId_key" ON "EmailMensagem"("messageId");

-- CreateIndex
CREATE INDEX "EmailMensagem_status_idx" ON "EmailMensagem"("status");

-- CreateIndex
CREATE INDEX "EmailMensagem_categoria_idx" ON "EmailMensagem"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoArquivo_sha256_key" ON "DocumentoArquivo"("sha256");

-- CreateIndex
CREATE INDEX "DocumentoArquivo_emailId_idx" ON "DocumentoArquivo"("emailId");

-- CreateIndex
CREATE INDEX "DocumentoArquivo_status_idx" ON "DocumentoArquivo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NfeDocument_chaveAcesso_key" ON "NfeDocument"("chaveAcesso");

-- CreateIndex
CREATE INDEX "NfeDocument_statusConferencia_idx" ON "NfeDocument"("statusConferencia");

-- CreateIndex
CREATE INDEX "NfeDocument_statusCompra_idx" ON "NfeDocument"("statusCompra");

-- CreateIndex
CREATE INDEX "NfeDocument_fornecedorId_idx" ON "NfeDocument"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "NfeDocument_emitenteCnpj_modelo_serie_numero_key" ON "NfeDocument"("emitenteCnpj", "modelo", "serie", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "NfeItem_movimentacaoEstoqueId_key" ON "NfeItem"("movimentacaoEstoqueId");

-- CreateIndex
CREATE INDEX "NfeItem_produtoId_idx" ON "NfeItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "NfeItem_documentoId_numeroItem_key" ON "NfeItem"("documentoId", "numeroItem");

-- CreateIndex
CREATE INDEX "ProdutoFornecedorMap_produtoId_idx" ON "ProdutoFornecedorMap"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedorMap_fornecedorId_codigoFornecedor_key" ON "ProdutoFornecedorMap"("fornecedorId", "codigoFornecedor");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_status_idx" ON "ReviewQueueItem"("status");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_documentoId_idx" ON "ReviewQueueItem"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQueueItem_entidadeTipo_entidadeId_motivo_ref_key" ON "ReviewQueueItem"("entidadeTipo", "entidadeId", "motivo", "ref");

-- CreateIndex
CREATE INDEX "ProcessingLog_entidadeTipo_entidadeId_idx" ON "ProcessingLog"("entidadeTipo", "entidadeId");

-- CreateIndex
CREATE INDEX "ProcessingLog_correlationId_idx" ON "ProcessingLog"("correlationId");

