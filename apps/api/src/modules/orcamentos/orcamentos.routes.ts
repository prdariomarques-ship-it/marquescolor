import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarOrcamentoSchema } from './orcamentos.schemas.js';

export const orcamentosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/orcamentos', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(100, parseInt(q.pageSize || '50', 10));
    const where: any = {};
    if (q.status) where.status = q.status;
    const [total, orcamentos] = await Promise.all([
      prisma.orcamento.count({ where }),
      prisma.orcamento.findMany({
        where, include: { cliente: true, itens: { include: { produto: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return reply.send({ data: orcamentos, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.get('/orcamentos/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const o = await prisma.orcamento.findUnique({
      where: { id }, include: { cliente: true, itens: { include: { produto: true } } },
    });
    if (!o) return reply.code(404).send({ erro: 'Orcamento nao encontrado' });
    return reply.send(o);
  });

  app.post('/orcamentos', { preHandler: authenticate }, async (req, reply) => {
    const parsed = criarOrcamentoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const d = parsed.data;
    try {
      const subtotal = d.itens.reduce((acc, it) => acc + (it.precoUnitarioCentavos * it.quantidade - it.descontoItemCentavos), 0);
      const total = Math.max(0, subtotal - d.descontoCentavos);

      // Proximo numero
      const ultimo = await prisma.orcamento.findFirst({ orderBy: { numero: 'desc' } });
      const numero = (ultimo?.numero || 0) + 1;

      const novo = await prisma.orcamento.create({
        data: {
          numero,
          clienteId: d.clienteId || null,
          usuarioId: req.usuario!.id,
          validade: d.validade ? new Date(d.validade) : null,
          subtotalCentavos: subtotal,
          descontoCentavos: d.descontoCentavos,
          totalCentavos: total,
          observacoes: d.observacoes,
        },
      });

      for (const it of d.itens) {
        await prisma.itemOrcamento.create({
          data: {
            orcamentoId: novo.id,
            produtoId: it.produtoId,
            quantidade: it.quantidade,
            precoUnitarioCentavos: it.precoUnitarioCentavos,
            descontoItemCentavos: it.descontoItemCentavos,
            subtotalCentavos: it.precoUnitarioCentavos * it.quantidade - it.descontoItemCentavos,
          },
        });
      }

      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'ORCAMENTO_CRIADO',
        entidade: 'Orcamento', entidadeId: novo.id, dadosDepois: { numero, total }, ip: req.ip,
      });

      const completo = await prisma.orcamento.findUnique({
        where: { id: novo.id }, include: { cliente: true, itens: { include: { produto: true } } },
      });
      return reply.code(201).send(completo);
    } catch (e: any) { return reply.code(400).send({ erro: e.message }); }
  });

  app.post('/orcamentos/:id/aprovar', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.orcamento.update({ where: { id }, data: { status: 'APROVADO' } });
    await registrarAuditoria(prisma, { usuarioId: req.usuario!.id, acao: 'ORCAMENTO_APROVADO', entidade: 'Orcamento', entidadeId: id, ip: req.ip });
    return reply.send({ ok: true });
  });

  app.post('/orcamentos/:id/cancelar', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.orcamento.update({ where: { id }, data: { status: 'CANCELADO' } });
    await registrarAuditoria(prisma, { usuarioId: req.usuario!.id, acao: 'ORCAMENTO_CANCELADO', entidade: 'Orcamento', entidadeId: id, ip: req.ip });
    return reply.send({ ok: true });
  });

  app.delete('/orcamentos/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.itemOrcamento.deleteMany({ where: { orcamentoId: id } });
    await prisma.orcamento.delete({ where: { id } });
    return reply.send({ ok: true });
  });
};
