import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { z } from 'zod';

const contaSchema = z.object({
  descricao: z.string().min(2).max(200),
  valorCentavos: z.number().int().positive(),
  vencimento: z.string(),
  formaPagamento: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  fornecedorId: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

const baixarSchema = z.object({
  valorPagoCentavos: z.number().int().positive(),
  pagoEm: z.string().optional(),
});

export const financeiroRoutes: FastifyPluginAsync = async (app) => {
  // CONTAS A RECEBER
  app.get('/contas-receber', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(100, parseInt(q.pageSize || '50', 10));
    const where: any = {};
    if (q.status) where.status = q.status;
    const [total, contas] = await Promise.all([
      prisma.contaReceber.count({ where }),
      prisma.contaReceber.findMany({
        where, include: { cliente: true },
        orderBy: { vencimento: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return reply.send({ data: contas, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.post('/contas-receber', { preHandler: authenticate }, async (req, reply) => {
    const parsed = contaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const c = await prisma.contaReceber.create({
      data: {
        ...parsed.data,
        clienteId: parsed.data.clienteId || null,
        vencimento: new Date(parsed.data.vencimento),
      } as any,
    });
    return reply.code(201).send(c);
  });

  app.post('/contas-receber/:id/baixar', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = baixarSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const conta = await prisma.contaReceber.findUnique({ where: { id } });
    if (!conta) return reply.code(404).send({ erro: 'Conta nao encontrada' });
    await prisma.contaReceber.update({
      where: { id },
      data: {
        status: 'PAGO',
        pagoEm: new Date(parsed.data.pagoEm || new Date()),
        valorPagoCentavos: parsed.data.valorPagoCentavos,
      },
    });
    return reply.send({ ok: true });
  });

  app.delete('/contas-receber/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.contaReceber.update({ where: { id }, data: { status: 'CANCELADO' } });
    return reply.send({ ok: true });
  });

  // CONTAS A PAGAR
  app.get('/contas-pagar', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(100, parseInt(q.pageSize || '50', 10));
    const where: any = {};
    if (q.status) where.status = q.status;
    const [total, contas] = await Promise.all([
      prisma.contaPagar.count({ where }),
      prisma.contaPagar.findMany({
        where, include: { fornecedor: true },
        orderBy: { vencimento: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return reply.send({ data: contas, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.post('/contas-pagar', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const parsed = contaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const c = await prisma.contaPagar.create({
      data: {
        ...parsed.data,
        fornecedorId: parsed.data.fornecedorId || null,
        vencimento: new Date(parsed.data.vencimento),
      } as any,
    });
    return reply.code(201).send(c);
  });

  app.post('/contas-pagar/:id/baixar', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = baixarSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    await prisma.contaPagar.update({
      where: { id },
      data: {
        status: 'PAGO',
        pagoEm: new Date(parsed.data.pagoEm || new Date()),
        valorPagoCentavos: parsed.data.valorPagoCentavos,
      },
    });
    return reply.send({ ok: true });
  });

  app.delete('/contas-pagar/:id', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.contaPagar.update({ where: { id }, data: { status: 'CANCELADO' } });
    return reply.send({ ok: true });
  });
};
