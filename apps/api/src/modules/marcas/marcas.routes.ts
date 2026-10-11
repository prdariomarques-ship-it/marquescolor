import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarMarcaSchema, atualizarMarcaSchema } from './marcas.schemas.js';

export const marcasRoutes: FastifyPluginAsync = async (app) => {
  app.get('/marcas', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { ativo?: string; busca?: string };
    const where: any = {};
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    if (q.busca) where.nome = { contains: q.busca };
    const marcas = await prisma.marca.findMany({
      where, orderBy: { nome: 'asc' },
    });
    return reply.send(marcas);
  });

  app.get('/marcas/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const marca = await prisma.marca.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
    if (!marca) return reply.code(404).send({ erro: 'Marca nao encontrada' });
    return reply.send(marca);
  });

  app.post('/marcas', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const parsed = criarMarcaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const marca = await prisma.marca.create({ data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'MARCA_CRIADA',
        entidade: 'Marca', entidadeId: marca.id, dadosDepois: marca, ip: req.ip,
      });
      return reply.code(201).send(marca);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Nome ja existe' });
      throw e;
    }
  });

  app.put('/marcas/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarMarcaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const antes = await prisma.marca.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Marca nao encontrada' });
    try {
      const atualizado = await prisma.marca.update({ where: { id }, data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'MARCA_EDITADA',
        entidade: 'Marca', entidadeId: id,
        dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
      });
      return reply.send(atualizado);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Nome ja existe' });
      throw e;
    }
  });

  app.delete('/marcas/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const marca = await prisma.marca.findUnique({ where: { id } });
    if (!marca) return reply.code(404).send({ erro: 'Marca nao encontrada' });
    await prisma.marca.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'MARCA_DESATIVADA',
      entidade: 'Marca', entidadeId: id, ip: req.ip,
    });
    return reply.send({ ok: true });
  });
};
