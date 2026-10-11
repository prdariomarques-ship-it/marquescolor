import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { entradaSchema, saidaSchema, ajusteSchema } from './estoque.schemas.js';

async function aplicarMovimentacao(
  produtoId: string,
  tipo: string,
  quantidade: number,  // ja com sinal correto
  motivo: string | null,
  documentoRef: string | null,
  usuarioId: string,
) {
  // Calcula saldo anterior/posterior e cria MovimentacaoEstoque
  const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
  if (!produto) throw new Error('Produto nao encontrado');
  if (!produto.ativo) throw new Error('Produto inativo');

  const saldoAnterior = produto.estoqueAtual;
  const saldoPosterior = saldoAnterior + quantidade;

  if (saldoPosterior < 0) {
    throw new Error('Saldo insuficiente para esta movimentacao');
  }

  await prisma.$transaction([
    prisma.produto.update({
      where: { id: produtoId },
      data: { estoqueAtual: saldoPosterior },
    }),
    prisma.movimentacaoEstoque.create({
      data: {
        produtoId, tipo, quantidade,
        saldoAnterior, saldoPosterior,
        motivo, documentoRef, usuarioId,
      },
    }),
  ]);

  return { saldoAnterior, saldoPosterior };
}

export const estoqueRoutes: FastifyPluginAsync = async (app) => {
  // Visao geral de estoque
  app.get('/estoque', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { busca?: string; status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));

    const where: any = {};
    if (q.busca) {
      where.OR = [
        { nome: { contains: q.busca } },
        { codigoInterno: { contains: q.busca } },
      ];
    }
    if (q.status === 'baixo') where.AND = [{ estoqueMinimo: { gt: 0 } }, { estoqueAtual: { lte: prisma.produto.fields.estoqueMinimo } }];
    if (q.status === 'zero') where.estoqueAtual = 0;
    if (q.status === 'negativo') where.estoqueAtual = { lt: 0 };

    const [total, produtos] = await Promise.all([
      prisma.produto.count({ where }),
      prisma.produto.findMany({
        where,
        select: {
          id: true, codigoInterno: true, nome: true, unidade: true,
          estoqueAtual: true, estoqueMinimo: true, estoqueMaximo: true,
          ativo: true,
          marca: { select: { nome: true } },
          categoria: { select: { nome: true } },
        },
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);

    // Marca status
    const dados = produtos.map(p => ({
      ...p,
      status: p.estoqueAtual <= 0 ? 'esgotado'
        : (p.estoqueMinimo > 0 && p.estoqueAtual <= p.estoqueMinimo ? 'baixo' : 'ok'),
    }));

    return reply.send({ data: dados, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  // Historico de movimentacoes
  app.get('/estoque/movimentacoes', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { produtoId?: string; tipo?: string; dataInicio?: string; dataFim?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));

    const where: any = {};
    if (q.produtoId) where.produtoId = q.produtoId;
    if (q.tipo) where.tipo = q.tipo;
    if (q.dataInicio || q.dataFim) {
      where.criadoEm = {};
      if (q.dataInicio) where.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.criadoEm.lte = new Date(q.dataFim);
    }

    const [total, movimentacoes] = await Promise.all([
      prisma.movimentacaoEstoque.count({ where }),
      prisma.movimentacaoEstoque.findMany({
        where,
        include: { produto: { select: { id: true, codigoInterno: true, nome: true, unidade: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);

    return reply.send({ data: movimentacoes, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  // Entrada manual — qualquer autenticado (mas ajuste requer ADMIN/GERENTE)
  app.post('/estoque/entrada', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA')] }, async (req, reply) => {
    const parsed = entradaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const { saldoAnterior, saldoPosterior } = await aplicarMovimentacao(
        parsed.data.produtoId, 'ENTRADA_DEVOLUCAO', parsed.data.quantidade,
        parsed.data.motivo || null, parsed.data.documentoRef || null,
        req.usuario!.id,
      );
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'ESTOQUE_ENTRADA',
        entidade: 'MovimentacaoEstoque', dadosDepois: { produtoId: parsed.data.produtoId, quantidade: parsed.data.quantidade, saldoAnterior, saldoPosterior }, ip: req.ip,
      });
      return reply.code(201).send({ ok: true, saldoAnterior, saldoPosterior });
    } catch (e: any) { return reply.code(400).send({ erro: e.message }); }
  });

  // Saida manual (perda, avaria) — ADMIN/GERENTE
  app.post('/estoque/saida', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const parsed = saidaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const quantidadeNegativa = -Math.abs(parsed.data.quantidade);
      const { saldoAnterior, saldoPosterior } = await aplicarMovimentacao(
        parsed.data.produtoId, parsed.data.tipo, quantidadeNegativa,
        parsed.data.motivo, parsed.data.documentoRef || null,
        req.usuario!.id,
      );
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'ESTOQUE_SAIDA',
        entidade: 'MovimentacaoEstoque', dadosDepois: { produtoId: parsed.data.produtoId, tipo: parsed.data.tipo, quantidade: quantidadeNegativa, motivo: parsed.data.motivo, saldoAnterior, saldoPosterior }, ip: req.ip,
      });
      return reply.code(201).send({ ok: true, saldoAnterior, saldoPosterior });
    } catch (e: any) { return reply.code(400).send({ erro: e.message }); }
  });

  // Ajuste manual (motivo obrigatorio) — ADMIN/GERENTE
  app.post('/estoque/ajuste', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const parsed = ajusteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const { saldoAnterior, saldoPosterior } = await aplicarMovimentacao(
        parsed.data.produtoId, 'AJUSTE_MANUAL', parsed.data.quantidade,
        parsed.data.motivo, parsed.data.documentoRef || null,
        req.usuario!.id,
      );
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'ESTOQUE_AJUSTE',
        entidade: 'MovimentacaoEstoque', dadosDepois: { produtoId: parsed.data.produtoId, quantidade: parsed.data.quantidade, motivo: parsed.data.motivo, saldoAnterior, saldoPosterior }, ip: req.ip,
      });
      return reply.code(201).send({ ok: true, saldoAnterior, saldoPosterior });
    } catch (e: any) { return reply.code(400).send({ erro: e.message }); }
  });
};
