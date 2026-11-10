// Servico de dominio do pipeline NF-e: persistencia, conferencia, revisao humana,
// aprovacao, recebimento fisico e entrada em estoque.
//
// ETAPAS SEPARADAS (campos distintos em NfeDocument; nada e "pulado"):
//   statusDocumento  : documento recebido/interpretado
//   statusConferencia: pendente -> em revisao -> conferida | rejeitada
//   statusCompra     : nao preparada -> preparada -> aprovada
//   recebimentoFisicoEm : mercadoria recebida fisicamente (acao humana)
//   statusEstoque    : nao aplicado -> aplicado | falha
// "Custo atualizado" e "preco aprovado" NAO existem aqui: este modulo nunca altera
// Produto.precoCustoCentavos/precoVendaCentavos. Ele apenas entrega dados
// estruturados (dadosCusto) ao modulo de custo/precos.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { decimalParaCentavos, decimalParaNumero } from './decimal.js';
import { cnpjValido, soDigitos, validarChave } from './chave.js';
import { nfeConfig } from './config.js';
import { calcularRevisoes } from './divergencias.js';
import { resolverProduto } from './matching.js';
import { abrirRevisao, registrarLog, sincronizarRevisoes, type Ctx, type Db } from './log.js';
import type { NfeExtraida } from './tipos.js';

export class ErroNegocio extends Error {
  constructor(public readonly status: number, message: string, public readonly detalhes?: unknown) {
    super(message);
    this.name = 'ErroNegocio';
  }
}

// ---------------------------------------------------------------- estoque (porta)

export interface EstoqueGateway {
  /** Entrada de estoque dentro da transacao recebida. NUNCA altera custo/preco. */
  entrada(tx: Prisma.TransactionClient, p: { produtoId: string; quantidade: number; documentoRef: string; usuarioId: string | null }): Promise<{ movimentacaoId: string }>;
}

export const estoqueGatewayPadrao: EstoqueGateway = {
  async entrada(tx, p) {
    const produto = await tx.produto.findUnique({ where: { id: p.produtoId } });
    if (!produto) throw new Error(`produto ${p.produtoId} nao existe`);
    const saldoAnterior = produto.estoqueAtual;
    const saldoPosterior = Math.round((saldoAnterior + p.quantidade) * 1000) / 1000;
    await tx.produto.update({ where: { id: p.produtoId }, data: { estoqueAtual: saldoPosterior } }); // somente saldo
    const mov = await tx.movimentacaoEstoque.create({
      data: {
        produtoId: p.produtoId,
        tipo: 'ENTRADA_COMPRA',
        quantidade: p.quantidade,
        saldoAnterior,
        saldoPosterior,
        motivo: 'Entrada por NF-e conferida e recebida',
        documentoRef: p.documentoRef,
        usuarioId: p.usuarioId,
      },
    });
    return { movimentacaoId: mov.id };
  },
};

export interface NfeDeps {
  estoque: EstoqueGateway;
}
export const depsPadrao: NfeDeps = { estoque: estoqueGatewayPadrao };

// ---------------------------------------------------------------- helpers

export function formatarCnpj(d: string): string {
  const s = soDigitos(d);
  return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : d;
}

export async function localizarFornecedorPorCnpj(db: Db, cnpj: string | null) {
  const digitos = soDigitos(cnpj);
  if (digitos.length !== 14) return null;
  const candidatos = await db.fornecedor.findMany({ where: { cnpj: { not: null } } });
  return candidatos.find((f) => soDigitos(f.cnpj) === digitos) ?? null;
}

const toDate = (s: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

function dadosItem(i: NfeExtraida['itens'][number], documentoId: string) {
  return {
    documentoId,
    numeroItem: i.numeroItem,
    codigoFornecedor: i.codigoFornecedor,
    gtin: i.gtin,
    descricao: i.descricao,
    ncm: i.ncm,
    cest: i.cest,
    cfop: i.cfop,
    origemMercadoria: i.origemMercadoria,
    cst: i.cst,
    csosn: i.csosn,
    unidade: i.unidade,
    unidadeTributavel: i.unidadeTributavel,
    quantidadeOriginal: i.quantidadeOriginal,
    quantidade: decimalParaNumero(i.quantidadeOriginal) ?? 0,
    valorUnitarioOriginal: i.valorUnitarioOriginal,
    valorUnitarioCentavos: decimalParaCentavos(i.valorUnitarioOriginal) ?? 0,
    valorTotalCentavos: i.valorTotalCentavos,
    freteCentavos: i.freteCentavos,
    seguroCentavos: i.seguroCentavos,
    descontoCentavos: i.descontoCentavos,
    outrasCentavos: i.outrasCentavos,
    icmsCentavos: i.icmsCentavos,
    icmsStCentavos: i.icmsStCentavos,
    ipiCentavos: i.ipiCentavos,
    pisCentavos: i.pisCentavos,
    cofinsCentavos: i.cofinsCentavos,
    impostosJson: i.impostosOriginais ? JSON.stringify(i.impostosOriginais) : null,
    origemDados: i.origemDados,
  };
}

export interface ResultadoPersistencia {
  documentoId: string;
  acao: 'CRIADO' | 'DUPLICADO' | 'PROMOVIDO_PARA_XML' | 'IGNORADO_FONTE_INFERIOR';
}

// ---------------------------------------------------------------- persistencia

export async function persistirExtracao(
  ctx: Ctx,
  extr: NfeExtraida,
  origem: { arquivoId?: string | null; emailId?: string | null },
): Promise<ResultadoPersistencia> {
  const emitCnpj = extr.emitente.cnpj ? soDigitos(extr.emitente.cnpj) : extr.emitente.cpf ? soDigitos(extr.emitente.cpf) : null;
  const vChave = extr.chaveAcesso
    ? validarChave(extr.chaveAcesso, { cnpjEmitente: extr.emitente.cnpj, modelo: extr.modelo, serie: extr.serie, numero: extr.numero, cUF: extr.cUF })
    : null;
  let chaveValida = !!vChave?.valida;
  if (extr.fonte !== 'XML' && extr.emitente.cnpj && !cnpjValido(extr.emitente.cnpj)) chaveValida = false; // CNPJ lido por OCR invalido

  // ---- duplicidade: por chave, depois por emitente+modelo+serie+numero
  let existente = extr.chaveAcesso ? await prisma.nfeDocument.findUnique({ where: { chaveAcesso: extr.chaveAcesso } }) : null;
  if (!existente && emitCnpj && extr.modelo && extr.serie && extr.numero) {
    existente = await prisma.nfeDocument.findFirst({ where: { emitenteCnpj: emitCnpj, modelo: extr.modelo, serie: extr.serie, numero: extr.numero } });
  }
  if (existente) {
    const podePromover = existente.fonteDados !== 'XML' && extr.fonte === 'XML' && existente.statusCompra !== 'APROVADA' && existente.statusConferencia !== 'REJEITADA';
    if (!podePromover) {
      const acao = existente.fonteDados === 'XML' && extr.fonte !== 'XML' ? 'IGNORADO_FONTE_INFERIOR' : 'DUPLICADO';
      await registrarLog(prisma, ctx, {
        entidadeTipo: 'NFE', entidadeId: existente.id,
        acao: acao === 'DUPLICADO' ? 'SKIP_DUPLICATE_CHAVE' : 'SKIP_FONTE_INFERIOR',
        mensagem: `NF-e ${existente.chaveAcesso ?? `${existente.serie}/${existente.numero}`} ja existe (documento ${existente.id}); nada foi duplicado`,
      });
      return { documentoId: existente.id, acao };
    }
    // XML chegou depois de uma leitura PDF/OCR da mesma nota: o XML prevalece.
    await prisma.$transaction(async (tx) => {
      const antigos = await tx.nfeItem.findMany({ where: { documentoId: existente!.id } });
      if (antigos.some((a) => a.movimentacaoEstoqueId)) throw new ErroNegocio(409, 'Documento ja teve estoque movimentado; nao pode ser promovido');
      for (const a of antigos) {
        await tx.reviewQueueItem.updateMany({
          where: { entidadeTipo: 'NFE_ITEM', entidadeId: a.id, status: 'ABERTO' },
          data: { status: 'RESOLVIDO', resolucao: 'AUTO: itens substituidos pelo XML', resolvidoEm: new Date() },
        });
      }
      await tx.nfeItem.deleteMany({ where: { documentoId: existente!.id } });
      await tx.nfeDocument.update({ where: { id: existente!.id }, data: cabecalho(extr, emitCnpj, chaveValida, origem) });
      for (const i of extr.itens) await tx.nfeItem.create({ data: dadosItem(i, existente!.id) });
      await registrarLog(tx, ctx, { entidadeTipo: 'NFE', entidadeId: existente!.id, acao: 'PROMOVIDO_PARA_XML', mensagem: 'Leitura de PDF/OCR substituida pelo XML (fonte prioritaria)' });
    });
    await reconciliarDocumento(ctx, existente.id);
    return { documentoId: existente.id, acao: 'PROMOVIDO_PARA_XML' };
  }

  const documentoId = await prisma.$transaction(async (tx) => {
    const doc = await tx.nfeDocument.create({ data: cabecalho(extr, emitCnpj, chaveValida, origem) });
    for (const i of extr.itens) await tx.nfeItem.create({ data: dadosItem(i, doc.id) });
    await registrarLog(tx, ctx, {
      entidadeTipo: 'NFE', entidadeId: doc.id, acao: 'DOCUMENTO_INTERPRETADO',
      mensagem: `${extr.itens.length} item(ns) lido(s) de ${extr.fonte}`,
      detalhe: { chave: extr.chaveAcesso, avisos: extr.avisos },
    });
    return doc.id;
  });
  await reconciliarDocumento(ctx, documentoId);
  return { documentoId, acao: 'CRIADO' };
}

function cabecalho(extr: NfeExtraida, emitCnpj: string | null, chaveValida: boolean, origem: { arquivoId?: string | null; emailId?: string | null }) {
  const t = extr.totais;
  const dados: Prisma.NfeDocumentUncheckedCreateInput = {
    arquivoId: origem.arquivoId ?? null,
    emailId: origem.emailId ?? null,
    chaveAcesso: extr.chaveAcesso,
    chaveValida,
    modelo: extr.modelo,
    serie: extr.serie,
    numero: extr.numero,
    naturezaOperacao: extr.naturezaOperacao,
    dataEmissao: toDate(extr.dataEmissao),
    emitenteCnpj: emitCnpj,
    emitenteNome: extr.emitente.nome,
    emitenteFantasia: extr.emitente.fantasia,
    emitenteIe: extr.emitente.ie,
    emitenteCrt: extr.emitente.crt,
    emitenteUf: extr.emitente.uf,
    destinatarioCnpj: extr.destinatario.cnpj ?? extr.destinatario.cpf,
    destinatarioNome: extr.destinatario.nome,
    valorProdutosCentavos: t.produtosCentavos ?? extr.itens.reduce((a, i) => a + i.valorTotalCentavos, 0),
    valorFreteCentavos: t.freteCentavos ?? 0,
    valorSeguroCentavos: t.seguroCentavos ?? 0,
    valorDescontoCentavos: t.descontoCentavos ?? 0,
    valorOutrasCentavos: t.outrasCentavos ?? 0,
    valorIcmsCentavos: t.icmsCentavos ?? 0,
    valorIcmsStCentavos: t.icmsStCentavos ?? 0,
    valorIpiCentavos: t.ipiCentavos ?? 0,
    valorPisCentavos: t.pisCentavos ?? 0,
    valorCofinsCentavos: t.cofinsCentavos ?? 0,
    valorTotalCentavos: t.notaCentavos ?? 0,
    pagamentoJson: JSON.stringify({ pagamentos: extr.pagamentos, duplicatas: extr.duplicatas }),
    protocoloAutorizacao: extr.protocolo?.numero ?? null,
    fonteDados: extr.fonte,
    origemCamposJson: JSON.stringify({ campos: extr.origemCampos, avisos: extr.avisos }),
    confianca: extr.fonte === 'XML' ? 0.98 : extr.fonte === 'PDF_TEXTO' ? 0.6 : 0.4,
  };
  return dados;
}

// ---------------------------------------------------------------- reconciliacao (idempotente)

/**
 * Reexecuta fornecedor -> correspondencia de produtos -> divergencias -> revisoes
 * -> estados. Seguro para chamar quantas vezes for preciso (mesmos IDs, mesmo
 * resultado). Nao toca em itens com decisao humana (CONFIRMADO/DISPENSADO).
 */
export async function reconciliarDocumento(ctx: Ctx, documentoId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doc = await tx.nfeDocument.findUnique({ where: { id: documentoId } });
    if (!doc) throw new ErroNegocio(404, 'Documento nao encontrado');

    let fornecedorId = doc.fornecedorId;
    if (!fornecedorId) {
      const f = await localizarFornecedorPorCnpj(tx, doc.emitenteCnpj);
      if (f) {
        fornecedorId = f.id;
        await tx.nfeDocument.update({ where: { id: doc.id }, data: { fornecedorId } });
        await registrarLog(tx, ctx, { entidadeTipo: 'NFE', entidadeId: doc.id, acao: 'FORNECEDOR_IDENTIFICADO', mensagem: `por CNPJ ${doc.emitenteCnpj}`, detalhe: { fornecedorId } });
      }
    }

    const itens = await tx.nfeItem.findMany({ where: { documentoId: doc.id }, orderBy: { numeroItem: 'asc' } });
    if (doc.statusCompra !== 'APROVADA') {
      for (const it of itens) {
        if (it.statusVinculo === 'CONFIRMADO' || it.statusVinculo === 'DISPENSADO') continue;
        const m = await resolverProduto(tx, { fornecedorId, codigoFornecedor: it.codigoFornecedor, gtin: it.gtin });
        if (m.produtoId !== it.produtoId || m.status !== it.statusVinculo || m.origem !== it.vinculoOrigem) {
          await tx.nfeItem.update({ where: { id: it.id }, data: { produtoId: m.produtoId, statusVinculo: m.status, vinculoOrigem: m.origem } });
          await registrarLog(tx, ctx, { entidadeTipo: 'NFE_ITEM', entidadeId: it.id, acao: 'PRODUTO_CORRESPONDIDO', status: m.status === 'SEM_CORRESPONDENCIA' ? 'WARN' : 'OK', mensagem: `${m.status}${m.origem ? ` via ${m.origem}` : ''}` });
        }
      }
    }

    const doc2 = await tx.nfeDocument.findUniqueOrThrow({ where: { id: doc.id } });
    const itens2 = await tx.nfeItem.findMany({ where: { documentoId: doc.id }, include: { produto: true }, orderBy: { numeroItem: 'asc' } });
    const cfg = nfeConfig();
    const desejadas = calcularRevisoes(doc2, itens2.map((i) => ({ ...i, produto: i.produto ? { id: i.produto.id, precoCustoCentavos: i.produto.precoCustoCentavos, unidade: i.produto.unidade } : null })), {
      toleranciaCentavos: cfg.toleranciaCentavos,
      limiteVariacaoCustoPct: cfg.limiteVariacaoCustoPct,
      cnpjLoja: cfg.cnpjLoja,
    });
    await sincronizarRevisoes(tx, ctx, doc.id, desejadas);
    await atualizarEstados(tx, ctx, doc.id);
  });
}

async function atualizarEstados(db: Db, ctx: Ctx, documentoId: string) {
  const doc = await db.nfeDocument.findUniqueOrThrow({ where: { id: documentoId } });
  if (doc.statusConferencia === 'REJEITADA' || doc.statusCompra === 'APROVADA') return;
  const bloqueantes = await db.reviewQueueItem.count({ where: { documentoId, status: 'ABERTO', severidade: 'BLOQUEANTE' } });
  const itens = await db.nfeItem.findMany({ where: { documentoId } });
  const todosResolvidos = itens.length > 0 && itens.every((i) => ['MAPEADO', 'CONFIRMADO', 'DISPENSADO'].includes(i.statusVinculo));
  const preparada = bloqueantes === 0 && todosResolvidos && !!doc.fornecedorId;
  const novaConferencia = bloqueantes > 0 ? 'EM_REVISAO' : 'PENDENTE';
  const novaCompra = preparada ? 'PREPARADA' : 'NAO_PREPARADA';
  if (novaConferencia !== doc.statusConferencia || novaCompra !== doc.statusCompra) {
    await db.nfeDocument.update({ where: { id: documentoId }, data: { statusConferencia: novaConferencia, statusCompra: novaCompra } });
    await registrarLog(db, ctx, { entidadeTipo: 'NFE', entidadeId: documentoId, acao: 'ESTADO_ATUALIZADO', mensagem: `conferencia=${novaConferencia}; compra=${novaCompra}; bloqueantes=${bloqueantes}` });
  }
}

// ---------------------------------------------------------------- eventos fiscais

export async function registrarEventoFiscal(
  ctx: Ctx,
  ev: { chave: string | null; tipoEvento: string | null; descricao: string | null },
  arquivoId: string,
): Promise<{ documentoId: string | null }> {
  const doc = ev.chave ? await prisma.nfeDocument.findUnique({ where: { chaveAcesso: ev.chave } }) : null;
  const cancelamento = ev.tipoEvento === '110111';
  if (doc) {
    await abrirRevisao(prisma, ctx, {
      documentoId: doc.id, entidadeTipo: 'NFE', entidadeId: doc.id,
      motivo: cancelamento ? 'EVENTO_FISCAL_CANCELAMENTO' : 'EVENTO_FISCAL_RECEBIDO',
      ref: arquivoId,
      severidade: cancelamento ? 'BLOQUEANTE' : 'ALERTA',
      detalhe: `Evento fiscal ${ev.tipoEvento ?? '?'} (${ev.descricao ?? 'sem descricao'}) recebido para esta NF-e. ${cancelamento ? 'NF-e cancelada: nao receber mercadoria; rejeite o documento.' : 'Conferir efeito do evento.'}`,
      dados: ev,
    });
    await atualizarEstados(prisma, ctx, doc.id);
    return { documentoId: doc.id };
  }
  await abrirRevisao(prisma, ctx, {
    entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: 'EVENTO_FISCAL_SEM_NOTA', severidade: 'ALERTA',
    detalhe: `Evento ${ev.tipoEvento ?? '?'} para chave ${ev.chave ?? '?'} sem NF-e correspondente no sistema.`, dados: ev,
  });
  return { documentoId: null };
}

// ---------------------------------------------------------------- acoes humanas

async function carregarDocumento(db: Db, id: string) {
  const doc = await db.nfeDocument.findUnique({ where: { id } });
  if (!doc) throw new ErroNegocio(404, 'Documento nao encontrado');
  return doc;
}

function exigirEditavel(doc: { statusCompra: string; statusConferencia: string }) {
  if (doc.statusConferencia === 'REJEITADA') throw new ErroNegocio(409, 'Documento rejeitado; nao pode ser alterado');
  if (doc.statusCompra === 'APROVADA') throw new ErroNegocio(409, 'Documento ja aprovado; nao pode ser alterado');
}

export async function vincularFornecedor(ctx: Ctx, documentoId: string, fornecedorId: string) {
  const doc = await carregarDocumento(prisma, documentoId);
  exigirEditavel(doc);
  const f = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!f) throw new ErroNegocio(404, 'Fornecedor nao encontrado');
  if (f.cnpj && doc.emitenteCnpj && soDigitos(f.cnpj) !== doc.emitenteCnpj) {
    throw new ErroNegocio(422, 'CNPJ do fornecedor escolhido difere do CNPJ do emitente da NF-e');
  }
  await prisma.nfeDocument.update({ where: { id: doc.id }, data: { fornecedorId } });
  await registrarLog(prisma, ctx, { entidadeTipo: 'NFE', entidadeId: doc.id, acao: 'FORNECEDOR_VINCULADO_HUMANO', mensagem: f.razaoSocial, detalhe: { fornecedorId } });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_FORNECEDOR_VINCULADO', entidade: 'NfeDocument', entidadeId: doc.id, dadosDepois: { fornecedorId }, ip: ctx.ip });
  await reconciliarDocumento(ctx, doc.id);
}

export async function vincularProduto(ctx: Ctx, itemId: string, p: { produtoId: string; criarMapeamento: boolean }) {
  const item = await prisma.nfeItem.findUnique({ where: { id: itemId }, include: { documento: true } });
  if (!item) throw new ErroNegocio(404, 'Item nao encontrado');
  exigirEditavel(item.documento);
  const produto = await prisma.produto.findUnique({ where: { id: p.produtoId } });
  if (!produto || !produto.ativo) throw new ErroNegocio(404, 'Produto nao encontrado ou inativo');
  if (p.criarMapeamento) {
    if (!item.documento.fornecedorId) throw new ErroNegocio(422, 'Vincule o fornecedor antes de criar o mapeamento do codigo');
    if (!item.codigoFornecedor) throw new ErroNegocio(422, 'Item sem codigo do fornecedor; nao ha o que mapear');
  }
  await prisma.$transaction(async (tx) => {
    await tx.nfeItem.update({ where: { id: item.id }, data: { produtoId: p.produtoId, statusVinculo: 'CONFIRMADO', vinculoOrigem: 'HUMANO', vinculoPorId: ctx.usuarioId ?? null } });
    if (p.criarMapeamento) {
      await tx.produtoFornecedorMap.upsert({
        where: { fornecedorId_codigoFornecedor: { fornecedorId: item.documento.fornecedorId!, codigoFornecedor: item.codigoFornecedor! } },
        create: { fornecedorId: item.documento.fornecedorId!, codigoFornecedor: item.codigoFornecedor!, produtoId: p.produtoId, criadoPorId: ctx.usuarioId ?? null },
        update: { produtoId: p.produtoId, criadoPorId: ctx.usuarioId ?? null },
      });
    }
    await registrarLog(tx, ctx, { entidadeTipo: 'NFE_ITEM', entidadeId: item.id, acao: 'PRODUTO_VINCULADO_HUMANO', mensagem: `${produto.codigoInterno} - ${produto.nome}`, detalhe: { produtoId: p.produtoId, criarMapeamento: p.criarMapeamento } });
  });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_ITEM_VINCULADO', entidade: 'NfeItem', entidadeId: item.id, dadosAntes: { produtoId: item.produtoId, status: item.statusVinculo }, dadosDepois: { produtoId: p.produtoId, status: 'CONFIRMADO' }, ip: ctx.ip });
  await reconciliarDocumento(ctx, item.documentoId);
}

export async function dispensarItem(ctx: Ctx, itemId: string, motivo: string) {
  const item = await prisma.nfeItem.findUnique({ where: { id: itemId }, include: { documento: true } });
  if (!item) throw new ErroNegocio(404, 'Item nao encontrado');
  exigirEditavel(item.documento);
  if (motivo.trim().length < 5) throw new ErroNegocio(400, 'Informe o motivo (minimo 5 caracteres)');
  await prisma.nfeItem.update({ where: { id: item.id }, data: { statusVinculo: 'DISPENSADO', vinculoOrigem: 'HUMANO', vinculoPorId: ctx.usuarioId ?? null, produtoId: null } });
  await registrarLog(prisma, ctx, { entidadeTipo: 'NFE_ITEM', entidadeId: item.id, acao: 'ITEM_DISPENSADO_HUMANO', mensagem: motivo });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_ITEM_DISPENSADO', entidade: 'NfeItem', entidadeId: item.id, dadosDepois: { motivo }, ip: ctx.ip });
  await reconciliarDocumento(ctx, item.documentoId);
}

/** Motivos que um humano pode aceitar/dispensar. Os demais exigem corrigir o dado (vincular, cadastrar...). */
const MOTIVOS_ACEITAVEIS = new Set([
  'DIVERGENCIA_TOTAL_PRODUTOS', 'DIVERGENCIA_TOTAL_NOTA', 'DIVERGENCIA_VALOR_ITEM', 'DIVERGENCIA_PRECO_CUSTO',
  'UNIDADE_DIVERGENTE', 'DADOS_FISCAIS_INCOMPLETOS', 'PROTOCOLO_AUSENTE', 'FONTE_NAO_XML', 'CHAVE_INVALIDA',
  'CHAVE_AUSENTE', 'DESTINATARIO_DIVERGENTE', 'EVENTO_FISCAL_RECEBIDO', 'EVENTO_FISCAL_SEM_NOTA', 'ARQUIVO_SEM_DADOS', 'EMAIL_NAO_CLASSIFICADO', 'FALHA_PROCESSAMENTO',
]);

export async function resolverRevisao(ctx: Ctx, revisaoId: string, d: { decisao: 'ACEITAR' | 'DISPENSAR'; observacao: string }) {
  const r = await prisma.reviewQueueItem.findUnique({ where: { id: revisaoId } });
  if (!r) throw new ErroNegocio(404, 'Item de revisao nao encontrado');
  if (r.status !== 'ABERTO') throw new ErroNegocio(409, 'Item de revisao ja decidido');
  if (d.observacao.trim().length < 5) throw new ErroNegocio(400, 'Observacao obrigatoria (minimo 5 caracteres)');
  if (!MOTIVOS_ACEITAVEIS.has(r.motivo)) {
    throw new ErroNegocio(422, `O motivo ${r.motivo} nao pode ser aceito manualmente: corrija o dado (vincule fornecedor/produto, rejeite o documento ou reprocese)`);
  }
  if (r.documentoId) exigirEditavel(await carregarDocumento(prisma, r.documentoId));
  await prisma.reviewQueueItem.update({
    where: { id: r.id },
    data: { status: d.decisao === 'ACEITAR' ? 'RESOLVIDO' : 'DISPENSADO', resolucao: d.observacao, resolvidoPorId: ctx.usuarioId ?? null, resolvidoEm: new Date() },
  });
  await registrarLog(prisma, ctx, { entidadeTipo: r.entidadeTipo, entidadeId: r.entidadeId, acao: `REVISAO_${d.decisao}`, mensagem: `${r.motivo}: ${d.observacao}` });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_REVISAO_DECIDIDA', entidade: 'ReviewQueueItem', entidadeId: r.id, dadosAntes: { status: 'ABERTO' }, dadosDepois: { decisao: d.decisao, observacao: d.observacao }, ip: ctx.ip });
  if (r.documentoId) await atualizarEstados(prisma, ctx, r.documentoId);
}

export async function rejeitarDocumento(ctx: Ctx, documentoId: string, motivo: string) {
  const doc = await carregarDocumento(prisma, documentoId);
  if (doc.statusConferencia === 'REJEITADA') throw new ErroNegocio(409, 'Documento ja rejeitado');
  if (doc.statusEstoque === 'APLICADO') throw new ErroNegocio(409, 'Estoque ja foi atualizado por este documento; use um ajuste/estorno de estoque');
  if (motivo.trim().length < 5) throw new ErroNegocio(400, 'Informe o motivo da rejeicao (minimo 5 caracteres)');
  await prisma.nfeDocument.update({ where: { id: doc.id }, data: { statusConferencia: 'REJEITADA', rejeitadoPorId: ctx.usuarioId ?? null, rejeitadoEm: new Date() } });
  await registrarLog(prisma, ctx, { entidadeTipo: 'NFE', entidadeId: doc.id, acao: 'DOCUMENTO_REJEITADO', status: 'WARN', mensagem: motivo });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_REJEITADA', entidade: 'NfeDocument', entidadeId: doc.id, dadosDepois: { motivo }, ip: ctx.ip });
}

// ---------------------------------------------------------------- compra preparada / aprovacao

export async function montarCompraPreparada(documentoId: string) {
  const doc = await carregarDocumento(prisma, documentoId);
  const itens = await prisma.nfeItem.findMany({ where: { documentoId }, include: { produto: true }, orderBy: { numeroItem: 'asc' } });
  const entram = itens.filter((i) => i.produtoId && ['MAPEADO', 'CONFIRMADO'].includes(i.statusVinculo));
  return {
    documentoId: doc.id,
    chaveAcesso: doc.chaveAcesso,
    fornecedorId: doc.fornecedorId,
    numeroPedido: `NFE-${doc.serie ?? '0'}/${doc.numero ?? '0'}`,
    dataCompra: doc.dataEmissao,
    subtotalCentavos: entram.reduce((a, i) => a + i.valorTotalCentavos, 0),
    descontoCentavos: doc.valorDescontoCentavos,
    freteCentavos: doc.valorFreteCentavos,
    totalNfCentavos: doc.valorTotalCentavos,
    itens: entram.map((i) => ({
      itemNfeId: i.id, produtoId: i.produtoId, codigoInterno: i.produto?.codigoInterno, quantidade: i.quantidade,
      valorUnitarioOriginal: i.valorUnitarioOriginal, valorTotalCentavos: i.valorTotalCentavos,
    })),
    itensDispensados: itens.filter((i) => i.statusVinculo === 'DISPENSADO').map((i) => i.id),
    prontaParaAprovacao: doc.statusCompra === 'PREPARADA',
    observacao: 'Compra preparada: nenhum efeito em estoque, custo ou preco ate recebimento fisico confirmado e aprovacao do modulo de custos.',
  };
}

export async function aprovarDocumento(ctx: Ctx, documentoId: string, d: { observacao?: string; reconheceAlertas: boolean }) {
  const doc = await carregarDocumento(prisma, documentoId);
  if (doc.statusConferencia === 'REJEITADA') throw new ErroNegocio(409, 'Documento rejeitado');
  if (doc.statusCompra === 'APROVADA') throw new ErroNegocio(409, 'Documento ja aprovado');
  if (doc.statusDocumento !== 'INTERPRETADO') throw new ErroNegocio(409, 'Documento nao interpretado');
  await reconciliarDocumento(ctx, documentoId); // garante estado atual antes de decidir
  const atual = await carregarDocumento(prisma, documentoId);
  const bloqueantes = await prisma.reviewQueueItem.findMany({ where: { documentoId, status: 'ABERTO', severidade: 'BLOQUEANTE' } });
  if (bloqueantes.length || atual.statusCompra !== 'PREPARADA') {
    throw new ErroNegocio(422, 'Documento com pendencias bloqueantes; resolva a fila de revisao antes de aprovar', bloqueantes.map((b) => ({ id: b.id, motivo: b.motivo, detalhe: b.detalhe })));
  }
  const alertas = await prisma.reviewQueueItem.findMany({ where: { documentoId, status: 'ABERTO', severidade: 'ALERTA' } });
  if (alertas.length && !d.reconheceAlertas) {
    throw new ErroNegocio(422, 'Existem alertas abertos; confirme com reconheceAlertas=true apos conferi-los', alertas.map((a) => ({ id: a.id, motivo: a.motivo, detalhe: a.detalhe })));
  }
  const prep = await montarCompraPreparada(documentoId);
  if (!prep.fornecedorId || prep.itens.length === 0) throw new ErroNegocio(422, 'Compra sem fornecedor ou sem itens elegiveis');

  // NAO cria Compra aqui: um registro Compra em qualquer status diferente de CONFIRMADA poderia ser
  // confirmado pela rota existente /compras/:id/confirmar, que move estoque E sobrescreve o custo.
  // "Compra aprovada" = NfeDocument.statusCompra=APROVADA + snapshot de compra preparada. A Compra
  // so nasce (ja CONFIRMADA) dentro da transacao que atualiza o estoque (aplicarEstoque).
  await prisma.$transaction(async (tx) => {
    await tx.nfeDocument.update({
      where: { id: documentoId },
      data: { statusCompra: 'APROVADA', statusConferencia: 'CONFERIDA', aprovadoPorId: ctx.usuarioId ?? null, aprovadoEm: new Date() },
    });
    for (const a of alertas) {
      await tx.reviewQueueItem.update({ where: { id: a.id }, data: { status: 'RESOLVIDO', resolucao: `ACEITO_NA_APROVACAO${d.observacao ? `: ${d.observacao}` : ''}`, resolvidoPorId: ctx.usuarioId ?? null, resolvidoEm: new Date() } });
    }
    await registrarLog(tx, ctx, { entidadeTipo: 'NFE', entidadeId: documentoId, acao: 'COMPRA_APROVADA', mensagem: d.observacao ?? null, detalhe: { alertasAceitos: alertas.map((a) => a.motivo), compraPreparada: prep } });
  });
  await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_APROVADA', entidade: 'NfeDocument', entidadeId: documentoId, dadosDepois: { observacao: d.observacao }, ip: ctx.ip });
  return { documentoId, compraPreparada: prep };
}

// ---------------------------------------------------------------- recebimento fisico + estoque

export interface EntradaRecebimento { itemId: string; quantidadeRecebida: number }

export async function confirmarRecebimento(
  ctx: Ctx,
  deps: NfeDeps,
  documentoId: string,
  d: { recebimentoIntegral?: boolean; itens?: EntradaRecebimento[]; motivoDivergencia?: string },
) {
  const doc = await carregarDocumento(prisma, documentoId);
  if (doc.statusCompra !== 'APROVADA') throw new ErroNegocio(409, 'Aprove a compra antes de confirmar o recebimento fisico');
  if (doc.statusConferencia === 'REJEITADA') throw new ErroNegocio(409, 'Documento rejeitado');
  if (doc.statusEstoque === 'APLICADO') return { jaAplicado: true, documentoId };
  const bloqueio = await prisma.reviewQueueItem.findMany({ where: { documentoId, status: 'ABERTO', severidade: 'BLOQUEANTE', NOT: { motivo: 'FALHA_INTEGRACAO_ESTOQUE' } } });
  if (bloqueio.length) throw new ErroNegocio(422, 'Ha pendencias bloqueantes abertas (ex.: evento de cancelamento)', bloqueio.map((b) => ({ id: b.id, motivo: b.motivo })));

  const itens = await prisma.nfeItem.findMany({ where: { documentoId }, include: { produto: true }, orderBy: { numeroItem: 'asc' } });
  const elegiveis = itens.filter((i) => i.produtoId && ['MAPEADO', 'CONFIRMADO'].includes(i.statusVinculo));
  const unidadeDifere = (i: (typeof itens)[number]) => !!i.unidade && !!i.produto?.unidade && i.unidade.toUpperCase() !== i.produto.unidade.toUpperCase();

  if (!doc.recebimentoFisicoEm) {
    // Etapa A: registrar o que foi recebido fisicamente (decisao humana)
    const recebidas = new Map<string, number>();
    if (d.recebimentoIntegral) {
      const comUnidadeDiferente = elegiveis.filter(unidadeDifere);
      if (comUnidadeDiferente.length) {
        throw new ErroNegocio(422, 'recebimentoIntegral nao se aplica a itens cuja unidade da NF difere da unidade do produto; informe a quantidade recebida NA UNIDADE DO PRODUTO',
          comUnidadeDiferente.map((i) => ({ itemId: i.id, unidadeNf: i.unidade, unidadeProduto: i.produto?.unidade, quantidadeNf: i.quantidade })));
      }
      for (const i of elegiveis) recebidas.set(i.id, i.quantidade);
    } else {
      for (const e of d.itens ?? []) recebidas.set(e.itemId, e.quantidadeRecebida);
      const faltando = elegiveis.filter((i) => !recebidas.has(i.id));
      if (faltando.length) throw new ErroNegocio(400, 'Informe a quantidade recebida de todos os itens (ou recebimentoIntegral=true)', faltando.map((i) => i.id));
      for (const k of recebidas.keys()) if (!elegiveis.some((i) => i.id === k)) throw new ErroNegocio(400, `Item ${k} nao pertence a esta NF-e ou nao e elegivel`);
    }
    for (const [, q] of recebidas) if (!Number.isFinite(q) || q < 0) throw new ErroNegocio(400, 'Quantidade recebida invalida');
    // unidade diferente conta SEMPRE como divergencia (a conversao precisa de justificativa auditavel)
    const divergentes = elegiveis.filter((i) => unidadeDifere(i) || Math.abs((recebidas.get(i.id) ?? 0) - i.quantidade) > 1e-9);
    if (divergentes.length && (d.motivoDivergencia ?? '').trim().length < 5) {
      throw new ErroNegocio(422, 'Quantidade recebida diverge da NF-e; informe motivoDivergencia (minimo 5 caracteres)',
        divergentes.map((i) => ({ itemId: i.id, nf: i.quantidade, recebida: recebidas.get(i.id) })));
    }
    await prisma.$transaction(async (tx) => {
      for (const i of elegiveis) await tx.nfeItem.update({ where: { id: i.id }, data: { quantidadeRecebida: recebidas.get(i.id) ?? 0 } });
      await tx.nfeDocument.update({ where: { id: documentoId }, data: { recebimentoFisicoEm: new Date(), recebimentoFisicoPorId: ctx.usuarioId ?? null } });
      for (const i of divergentes) {
        await abrirRevisao(tx, ctx, {
          documentoId, entidadeTipo: 'NFE_ITEM', entidadeId: i.id, motivo: 'DIVERGENCIA_QUANTIDADE_RECEBIMENTO', severidade: 'ALERTA',
          detalhe: `Item ${i.numeroItem}: NF ${i.quantidade} ${i.unidade ?? ''}, recebido ${recebidas.get(i.id)} ${i.produto?.unidade ?? ''}. Motivo: ${d.motivoDivergencia}`, dados: { nf: i.quantidade, unidadeNf: i.unidade, recebida: recebidas.get(i.id), unidadeProduto: i.produto?.unidade },
        });
        await tx.reviewQueueItem.updateMany({
          where: { entidadeTipo: 'NFE_ITEM', entidadeId: i.id, motivo: 'DIVERGENCIA_QUANTIDADE_RECEBIMENTO' },
          data: { status: 'RESOLVIDO', resolucao: d.motivoDivergencia, resolvidoPorId: ctx.usuarioId ?? null, resolvidoEm: new Date() },
        });
      }
      await registrarLog(tx, ctx, { entidadeTipo: 'NFE', entidadeId: documentoId, acao: 'RECEBIMENTO_FISICO_CONFIRMADO', mensagem: divergentes.length ? `com ${divergentes.length} divergencia(s) de quantidade` : 'integral' });
    });
    await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_RECEBIMENTO_CONFIRMADO', entidade: 'NfeDocument', entidadeId: documentoId, dadosDepois: { itens: [...recebidas.entries()], motivoDivergencia: d.motivoDivergencia }, ip: ctx.ip });
  }
  return aplicarEstoque(ctx, deps, documentoId);
}

/** Etapa B (retentavel): entrada em estoque a partir das quantidades JA confirmadas. Idempotente por item. */
export async function aplicarEstoque(ctx: Ctx, deps: NfeDeps, documentoId: string) {
  const doc = await carregarDocumento(prisma, documentoId);
  if (!doc.recebimentoFisicoEm) throw new ErroNegocio(409, 'Recebimento fisico ainda nao confirmado');
  if (doc.statusEstoque === 'APLICADO') return { jaAplicado: true, documentoId };
  const ref = `NF-e ${doc.chaveAcesso ?? `${doc.serie}/${doc.numero}`}`;
  try {
    const movimentos = await prisma.$transaction(async (tx) => {
      const itens = await tx.nfeItem.findMany({ where: { documentoId } });
      const out: { itemId: string; movimentacaoId: string; quantidade: number }[] = [];
      for (const i of itens) {
        if (i.movimentacaoEstoqueId || !i.produtoId || i.quantidadeRecebida === null || i.quantidadeRecebida <= 0) continue;
        const r = await deps.estoque.entrada(tx, { produtoId: i.produtoId, quantidade: i.quantidadeRecebida, documentoRef: ref, usuarioId: ctx.usuarioId ?? null });
        await tx.nfeItem.update({ where: { id: i.id }, data: { movimentacaoEstoqueId: r.movimentacaoId } });
        out.push({ itemId: i.id, movimentacaoId: r.movimentacaoId, quantidade: i.quantidadeRecebida });
      }
      await tx.nfeDocument.update({ where: { id: documentoId }, data: { statusEstoque: 'APLICADO', estoqueAtualizadoEm: new Date() } });
      // A Compra nasce JA CONFIRMADA e junto com a entrada em estoque (mesma transacao): nao existe janela
      // em que /compras/:id/confirmar possa duplicar estoque nem sobrescrever custo. O custo NAO e
      // atualizado aqui; ItemCompra.precoCustoCentavos e apenas o unitario da NF (informativo).
      if (!doc.fornecedorId) throw new Error('documento sem fornecedor');
      const recebidos = await tx.nfeItem.findMany({ where: { documentoId, quantidadeRecebida: { gt: 0 }, produtoId: { not: null } } });
      const compra = await tx.compra.create({
        data: {
          fornecedorId: doc.fornecedorId, numeroPedido: `NFE-${doc.serie ?? '0'}/${doc.numero ?? '0'}`, dataCompra: doc.dataEmissao ?? new Date(),
          subtotalCentavos: recebidos.reduce((a, i) => a + i.valorTotalCentavos, 0), descontoCentavos: doc.valorDescontoCentavos, freteCentavos: doc.valorFreteCentavos,
          totalCentavos: doc.valorTotalCentavos, usuarioId: ctx.usuarioId ?? 'sistema', status: 'CONFIRMADA',
          observacoes: `Gerada pela NF-e ${doc.chaveAcesso ?? ''} apos aprovacao humana e recebimento fisico. Estoque atualizado; custo e preco NAO foram alterados por este fluxo.`,
        },
      });
      for (const i of recebidos) {
        await tx.itemCompra.create({ data: { compraId: compra.id, produtoId: i.produtoId!, quantidade: i.quantidadeRecebida!, precoCustoCentavos: i.valorUnitarioCentavos, subtotalCentavos: i.valorTotalCentavos } });
      }
      await tx.nfeDocument.update({ where: { id: documentoId }, data: { compraId: compra.id } });
      await tx.reviewQueueItem.updateMany({
        where: { documentoId, motivo: 'FALHA_INTEGRACAO_ESTOQUE', status: 'ABERTO' },
        data: { status: 'RESOLVIDO', resolucao: 'RETENTATIVA_OK', resolvidoEm: new Date() },
      });
      await registrarLog(tx, ctx, { entidadeTipo: 'NFE', entidadeId: documentoId, acao: 'ESTOQUE_ATUALIZADO', mensagem: `${out.length} movimentacao(oes)`, detalhe: out });
      return out;
    });
    await registrarAuditoria(prisma, { usuarioId: ctx.usuarioId, acao: 'NFE_ESTOQUE_ATUALIZADO', entidade: 'NfeDocument', entidadeId: documentoId, dadosDepois: { movimentos }, ip: ctx.ip });
    return { jaAplicado: false, documentoId, movimentos };
  } catch (e: any) {
    // transacao desfeita: nenhum saldo mudou. Recebimento fisico continua registrado.
    await prisma.nfeDocument.update({ where: { id: documentoId }, data: { statusEstoque: 'FALHA' } });
    await registrarLog(prisma, ctx, { entidadeTipo: 'NFE', entidadeId: documentoId, acao: 'ESTOQUE_FALHA', status: 'ERROR', mensagem: String(e?.message ?? e) });
    await abrirRevisao(prisma, ctx, {
      documentoId, entidadeTipo: 'NFE', entidadeId: documentoId, motivo: 'FALHA_INTEGRACAO_ESTOQUE', severidade: 'BLOQUEANTE',
      detalhe: `Falha ao atualizar estoque: ${String(e?.message ?? e)}. Nenhum saldo foi alterado; repita a operacao.`,
    });
    throw new ErroNegocio(502, 'Falha na integracao com estoque; nenhuma movimentacao foi gravada. Repita a operacao.', { causa: String(e?.message ?? e) });
  }
}

// ---------------------------------------------------------------- dados para o modulo de custo

/**
 * Contrato de saida para o modulo de custo de aquisicao/motor de precos (NAO e
 * calculo). So disponivel apos aprovacao. Ver docs/integrations/nfe-pricing-contract.md
 */
export async function dadosParaCusto(documentoId: string) {
  const doc = await carregarDocumento(prisma, documentoId);
  if (doc.statusCompra !== 'APROVADA') throw new ErroNegocio(409, 'Dados de custo so ficam disponiveis apos aprovacao humana da NF-e');
  const itens = await prisma.nfeItem.findMany({ where: { documentoId }, include: { produto: true }, orderBy: { numeroItem: 'asc' } });
  return {
    contrato: 'nfe-pricing-contract/v1',
    documento: {
      id: doc.id, chaveAcesso: doc.chaveAcesso, numero: doc.numero, serie: doc.serie, dataEmissao: doc.dataEmissao,
      fonteDados: doc.fonteDados, fornecedorId: doc.fornecedorId, emitenteCnpj: doc.emitenteCnpj, emitenteCrt: doc.emitenteCrt, emitenteUf: doc.emitenteUf,
      aprovadoEm: doc.aprovadoEm, aprovadoPorId: doc.aprovadoPorId,
    },
    estagios: {
      aprovada: true,
      recebimentoFisicoConfirmado: !!doc.recebimentoFisicoEm,
      estoqueAtualizado: doc.statusEstoque === 'APLICADO',
      custoAtualizadoPorEsteModulo: false,
      precoAprovadoPorEsteModulo: false,
    },
    totaisDocumento: {
      produtosCentavos: doc.valorProdutosCentavos, freteCentavos: doc.valorFreteCentavos, seguroCentavos: doc.valorSeguroCentavos,
      descontoCentavos: doc.valorDescontoCentavos, outrasCentavos: doc.valorOutrasCentavos, icmsCentavos: doc.valorIcmsCentavos,
      icmsStCentavos: doc.valorIcmsStCentavos, ipiCentavos: doc.valorIpiCentavos, pisCentavos: doc.valorPisCentavos,
      cofinsCentavos: doc.valorCofinsCentavos, notaCentavos: doc.valorTotalCentavos,
    },
    itens: itens
      .filter((i) => i.produtoId && ['MAPEADO', 'CONFIRMADO'].includes(i.statusVinculo))
      .map((i) => ({
        itemNfeId: i.id, produtoId: i.produtoId, codigoInterno: i.produto?.codigoInterno ?? null,
        custoAtualProdutoCentavos: i.produto?.precoCustoCentavos ?? null,
        quantidadeNf: i.quantidade, quantidadeRecebida: i.quantidadeRecebida,
        unidade: i.unidade, unidadeTributavel: i.unidadeTributavel,
        quantidadeOriginal: i.quantidadeOriginal, valorUnitarioOriginal: i.valorUnitarioOriginal, valorTotalCentavos: i.valorTotalCentavos,
        freteCentavos: i.freteCentavos, seguroCentavos: i.seguroCentavos, descontoCentavos: i.descontoCentavos, outrasCentavos: i.outrasCentavos,
        impostos: { icmsCentavos: i.icmsCentavos, icmsStCentavos: i.icmsStCentavos, ipiCentavos: i.ipiCentavos, pisCentavos: i.pisCentavos, cofinsCentavos: i.cofinsCentavos },
        fiscal: { ncm: i.ncm, cest: i.cest, cfop: i.cfop, origem: i.origemMercadoria, cst: i.cst, csosn: i.csosn },
        origemDados: i.origemDados,
      })),
  };
}

// ---------------------------------------------------------------- leitura

export async function detalheDocumento(id: string) {
  const doc = await prisma.nfeDocument.findUnique({
    where: { id },
    include: {
      itens: { orderBy: { numeroItem: 'asc' }, include: { produto: { select: { id: true, codigoInterno: true, nome: true, unidade: true, estoqueAtual: true } } } },
      fornecedor: { select: { id: true, razaoSocial: true, cnpj: true } },
      arquivo: { select: { id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true, sha256: true, tipoDetectado: true, metodoExtracao: true } },
      email: { select: { id: true, messageId: true, remetente: true, assunto: true, recebidoEm: true } },
    },
  });
  if (!doc) throw new ErroNegocio(404, 'Documento nao encontrado');
  const itemIds = doc.itens.map((i) => i.id);
  const [revisoes, logs] = await Promise.all([
    prisma.reviewQueueItem.findMany({ where: { documentoId: id }, orderBy: [{ status: 'asc' }, { criadoEm: 'asc' }] }),
    prisma.processingLog.findMany({
      where: { OR: [{ entidadeTipo: 'NFE', entidadeId: id }, { entidadeTipo: 'NFE_ITEM', entidadeId: { in: itemIds } }] },
      orderBy: { criadoEm: 'asc' }, take: 500,
    }),
  ]);
  return { ...doc, revisoes, historico: logs };
}
