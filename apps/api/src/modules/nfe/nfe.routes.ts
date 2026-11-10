// Rotas /api/nfe/* — contratos documentados em docs/integrations/nfe-api.md
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { lerOriginal } from '../documentos/armazenamento.js';
import { criarMotorTesseract, opcoesTesseractDoAmbiente } from '../documentos/ocr.js';
import { depsDocumentosPadrao, type DepsDocumentos } from '../documentos/pipeline.js';
import { configImapDoAmbiente, criarFonteImap } from '../email/imap.js';
import { sincronizarCaixa } from '../email/ingestao-email.js';
import type { EmailSource } from '../email/tipos.js';
import { ingerirArquivo, reprocessarArquivo } from './ingestao.js';
import { novoContexto } from './log.js';
import {
  aplicarEstoque, aprovarDocumento, confirmarRecebimento, dadosParaCusto, depsPadrao, detalheDocumento, dispensarItem, ErroNegocio,
  montarCompraPreparada, reconciliarDocumento, rejeitarDocumento, resolverRevisao, vincularFornecedor, vincularProduto, type NfeDeps,
} from './servico.js';

export interface NfeModuloOpcoes {
  deps?: NfeDeps;
  documentos?: DepsDocumentos;
  /** fabrica da fonte de e-mail; padrao = IMAP configurado por variaveis de ambiente (ou null) */
  fonteEmail?: () => EmailSource | null;
}

const GERENCIA = [authenticate, requireRole('ADMIN', 'GERENTE')];

function documentosPadrao(): DepsDocumentos {
  const base = depsDocumentosPadrao();
  const o = opcoesTesseractDoAmbiente();
  if (o) base.ocr = criarMotorTesseract(o);
  return base;
}

function fonteEmailPadrao(): EmailSource | null {
  const c = configImapDoAmbiente();
  return c.ok ? criarFonteImap(c.config) : null;
}

const ctxDe = (req: FastifyRequest) => novoContexto({ usuarioId: req.usuario?.id ?? null, ip: req.ip });

async function tratar(reply: FastifyReply, fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof ErroNegocio) return reply.code(e.status).send({ erro: e.message, detalhes: e.detalhes });
    if (e instanceof z.ZodError) return reply.code(400).send({ erro: e.issues[0]?.message ?? 'Requisicao invalida' });
    throw e;
  }
}

const idParams = z.object({ id: z.string().min(1) });
const aprovarBody = z.object({ observacao: z.string().max(500).optional(), reconheceAlertas: z.boolean().default(false) });
const motivoBody = z.object({ motivo: z.string().min(1).max(500) });
const vincularFornecedorBody = z.object({ fornecedorId: z.string().min(1) });
const vincularProdutoBody = z.object({ produtoId: z.string().min(1), criarMapeamento: z.boolean().default(true) });
const resolverBody = z.object({ decisao: z.enum(['ACEITAR', 'DISPENSAR']), observacao: z.string().min(1).max(500) });
const recebimentoBody = z.object({
  recebimentoIntegral: z.boolean().optional(),
  itens: z.array(z.object({ itemId: z.string().min(1), quantidadeRecebida: z.number().finite().min(0) })).optional(),
  motivoDivergencia: z.string().max(500).optional(),
});

export const nfeRoutes: FastifyPluginAsync<NfeModuloOpcoes> = async (app, opcoes) => {
  const deps = opcoes.deps ?? depsPadrao;
  let docDeps: DepsDocumentos | null = opcoes.documentos ?? null;
  const documentos = () => (docDeps ??= documentosPadrao());
  const fonteEmail = opcoes.fonteEmail ?? fonteEmailPadrao;

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 10, fields: 5 } });

  app.addHook('onClose', async () => {
    try { await docDeps?.ocr?.encerrar?.(); } catch { /* encerramento do OCR nao deve impedir o fechamento da API */ }
  });

  // ------------------------------------------------------------ upload / arquivos

  app.post('/nfe/upload', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    if (!req.isMultipart()) throw new ErroNegocio(400, 'Envie multipart/form-data com o(s) arquivo(s)');
    const ctx = ctxDe(req);
    const resultados: unknown[] = [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      let bytes: Buffer;
      try {
        bytes = await part.toBuffer();
      } catch {
        resultados.push({ nome: part.filename, erro: { codigo: 'ARQUIVO_GRANDE_DEMAIS', mensagem: 'Arquivo excede 15 MB' } });
        continue;
      }
      if (part.file.truncated) {
        resultados.push({ nome: part.filename, erro: { codigo: 'ARQUIVO_GRANDE_DEMAIS', mensagem: 'Arquivo excede 15 MB' } });
        continue;
      }
      const r = await ingerirArquivo(ctx, documentos(), { bytes, nome: part.filename || 'upload', mime: part.mimetype, origem: 'UPLOAD' });
      resultados.push({ nome: part.filename, ...r });
    }
    if (!resultados.length) throw new ErroNegocio(400, 'Nenhum arquivo recebido');
    return reply.code(201).send({ resultados });
  }));

  app.get('/nfe/arquivos/:id', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const a = await prisma.documentoArquivo.findUnique({ where: { id }, include: { documentos: { select: { id: true, chaveAcesso: true } } } });
    if (!a) throw new ErroNegocio(404, 'Arquivo nao encontrado');
    return reply.send(a);
  }));

  app.get('/nfe/arquivos/:id/original', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const a = await prisma.documentoArquivo.findUnique({ where: { id } });
    if (!a) throw new ErroNegocio(404, 'Arquivo nao encontrado');
    const bytes = await lerOriginal(a.caminho);
    return reply.header('content-type', a.mimeType).header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`).send(bytes);
  }));

  app.post('/nfe/arquivos/:id/reprocessar', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    try {
      return reply.send(await reprocessarArquivo(ctxDe(req), documentos(), id));
    } catch (e: any) {
      if (e?.message === 'Arquivo nao encontrado') throw new ErroNegocio(404, e.message);
      throw e;
    }
  }));

  // ------------------------------------------------------------ documentos

  app.get('/nfe/documentos', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '50', 10) || 50));
    const where: any = {};
    if (q.statusConferencia) where.statusConferencia = q.statusConferencia;
    if (q.statusCompra) where.statusCompra = q.statusCompra;
    if (q.statusEstoque) where.statusEstoque = q.statusEstoque;
    if (q.fornecedorId) where.fornecedorId = q.fornecedorId;
    if (q.busca) where.OR = [{ chaveAcesso: { contains: q.busca } }, { numero: { contains: q.busca } }, { emitenteNome: { contains: q.busca } }, { emitenteCnpj: { contains: q.busca.replace(/\D/g, '') || '__' } }];
    const [total, data] = await Promise.all([
      prisma.nfeDocument.count({ where }),
      prisma.nfeDocument.findMany({
        where, orderBy: { criadoEm: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: { fornecedor: { select: { id: true, razaoSocial: true } }, _count: { select: { itens: true } } },
      }),
    ]);
    const ids = data.map((d) => d.id);
    const abertos = await prisma.reviewQueueItem.groupBy({ by: ['documentoId'], where: { documentoId: { in: ids }, status: 'ABERTO' }, _count: { _all: true } });
    const mapa = new Map(abertos.map((a) => [a.documentoId, a._count._all]));
    return reply.send({ data: data.map((d) => ({ ...d, pendenciasAbertas: mapa.get(d.id) ?? 0 })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }));

  app.get('/nfe/documentos/:id', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    return reply.send(await detalheDocumento(id));
  }));

  app.post('/nfe/documentos/:id/reconciliar', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    await reconciliarDocumento(ctxDe(req), id);
    return reply.send(await detalheDocumento(id));
  }));

  app.get('/nfe/documentos/:id/compra-preparada', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    return reply.send(await montarCompraPreparada(id));
  }));

  app.post('/nfe/documentos/:id/vincular-fornecedor', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = vincularFornecedorBody.parse(req.body);
    await vincularFornecedor(ctxDe(req), id, b.fornecedorId);
    return reply.send(await detalheDocumento(id));
  }));

  app.post('/nfe/itens/:id/vincular-produto', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = vincularProdutoBody.parse(req.body);
    await vincularProduto(ctxDe(req), id, b);
    const item = await prisma.nfeItem.findUniqueOrThrow({ where: { id } });
    return reply.send(await detalheDocumento(item.documentoId));
  }));

  app.post('/nfe/itens/:id/dispensar', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = motivoBody.parse(req.body);
    await dispensarItem(ctxDe(req), id, b.motivo);
    const item = await prisma.nfeItem.findUniqueOrThrow({ where: { id } });
    return reply.send(await detalheDocumento(item.documentoId));
  }));

  app.post('/nfe/documentos/:id/aprovar', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = aprovarBody.parse(req.body ?? {});
    const r = await aprovarDocumento(ctxDe(req), id, b);
    return reply.send({ ...r, documento: await detalheDocumento(id) });
  }));

  app.post('/nfe/documentos/:id/rejeitar', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = motivoBody.parse(req.body);
    await rejeitarDocumento(ctxDe(req), id, b.motivo);
    return reply.send(await detalheDocumento(id));
  }));

  app.post('/nfe/documentos/:id/confirmar-recebimento', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = recebimentoBody.parse(req.body ?? {});
    const r = await confirmarRecebimento(ctxDe(req), deps, id, b);
    return reply.send({ ...r, documento: await detalheDocumento(id) });
  }));

  app.post('/nfe/documentos/:id/aplicar-estoque', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const r = await aplicarEstoque(ctxDe(req), deps, id);
    return reply.send({ ...r, documento: await detalheDocumento(id) });
  }));

  app.get('/nfe/documentos/:id/dados-custo', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    return reply.send(await dadosParaCusto(id));
  }));

  // ------------------------------------------------------------ fila de revisao e historico

  app.get('/nfe/fila-revisao', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '50', 10) || 50));
    const where: any = { status: q.status || 'ABERTO' };
    if (q.motivo) where.motivo = q.motivo;
    if (q.severidade) where.severidade = q.severidade;
    if (q.documentoId) where.documentoId = q.documentoId;
    const [total, data] = await Promise.all([
      prisma.reviewQueueItem.count({ where }),
      prisma.reviewQueueItem.findMany({ where, orderBy: [{ severidade: 'asc' }, { criadoEm: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return reply.send({ data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }));

  app.post('/nfe/fila-revisao/:id/resolver', { preHandler: GERENCIA }, async (req, reply) => tratar(reply, async () => {
    const { id } = idParams.parse(req.params);
    const b = resolverBody.parse(req.body);
    await resolverRevisao(ctxDe(req), id, b);
    return reply.send(await prisma.reviewQueueItem.findUniqueOrThrow({ where: { id } }));
  }));

  app.get('/nfe/historico', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const q = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (q.entidadeTipo) where.entidadeTipo = q.entidadeTipo;
    if (q.entidadeId) where.entidadeId = q.entidadeId;
    if (q.correlationId) where.correlationId = q.correlationId;
    if (q.status) where.status = q.status;
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '100', 10) || 100));
    const data = await prisma.processingLog.findMany({ where, orderBy: { criadoEm: 'desc' }, take: pageSize });
    return reply.send({ data });
  }));

  // ------------------------------------------------------------ e-mail

  app.get('/nfe/emails', { preHandler: authenticate }, async (req, reply) => tratar(reply, async () => {
    const q = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.categoria) where.categoria = q.categoria;
    const data = await prisma.emailMensagem.findMany({ where, orderBy: { recebidoEm: 'desc' }, take: 100, include: { arquivos: { select: { id: true, nomeOriginal: true, status: true } } } });
    return reply.send({ data });
  }));

  app.get('/nfe/email/status', { preHandler: GERENCIA }, async (_req, reply) => {
    const c = configImapDoAmbiente();
    return reply.send({ configurado: c.ok, faltando: c.ok ? [] : c.faltando, modo: c.ok ? c.config.modo : null, caixa: c.ok ? c.config.rotulo : null, observacao: 'Credenciais so por variavel de ambiente; Outlook.com exige OAuth2/Graph.' });
  });

  app.post('/nfe/email/sincronizar', { preHandler: [authenticate, requireRole('ADMIN')] }, async (req, reply) => tratar(reply, async () => {
    const fonte = fonteEmail();
    if (!fonte) throw new ErroNegocio(503, 'Caixa de e-mail nao configurada (variaveis EMAIL_IMAP_* ausentes)');
    const r = await sincronizarCaixa(ctxDe(req), documentos(), fonte);
    return reply.code(r.ok ? 200 : 502).send(r);
  }));

  app.get('/nfe/ocr/status', { preHandler: GERENCIA }, async (_req, reply) => {
    const o = opcoesTesseractDoAmbiente();
    return reply.send({ configurado: !!o, langPath: o?.langPath ?? null, idioma: o?.lang ?? null, observacao: 'OCR offline (tesseract.js); sem download automatico.' });
  });
};
