import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarCategoriaSchema, atualizarCategoriaSchema } from './categorias.schemas.js';

export const categoriasRoutes: FastifyPluginAsync = async (app) => {
  // Listar — qualquer autenticado
  app.get('/categorias', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { ativo?: string; busca?: string };
    const where: any = {};
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    if (q.busca) where.nome = { contains: q.busca };
    const categorias = await prisma.categoria.findMany({
      where,
      orderBy: { nome: 'asc' },
    });
    return reply.send(categorias);
  });

  // Buscar por id
  app.get('/categorias/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cat = await prisma.categoria.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
    if (!cat) return reply.code(404).send({ erro: 'Categoria nao encontrada' });
    return reply.send(cat);
  });

  // Criar — ADMIN ou GERENTE
  app.post('/categorias', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const parsed = criarCategoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    }
    try {
      const cat = await prisma.categoria.create({
        data: { ...parsed.data, corHex: parsed.data.corHex || null },
      });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'CATEGORIA_CRIADA',
        entidade: 'Categoria', entidadeId: cat.id, dadosDepois: cat, ip: req.ip,
      });
      return reply.code(201).send(cat);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Nome ja existe' });
      throw e;
    }
  });

  // Editar — ADMIN ou GERENTE
  app.put('/categorias/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarCategoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    }
    const antes = await prisma.categoria.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Categoria nao encontrada' });
    try {
      const atualizado = await prisma.categoria.update({
        where: { id },
        data: parsed.data,
      });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'CATEGORIA_EDITADA',
        entidade: 'Categoria', entidadeId: id,
        dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
      });
      return reply.send(atualizado);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Nome ja existe' });
      throw e;
    }
  });

  // Soft delete (desativar) — ADMIN ou GERENTE
  app.delete('/categorias/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cat = await prisma.categoria.findUnique({ where: { id } });
    if (!cat) return reply.code(404).send({ erro: 'Categoria nao encontrada' });
    await prisma.categoria.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CATEGORIA_DESATIVADA',
      entidade: 'Categoria', entidadeId: id, ip: req.ip,
    });
    return reply.send({ ok: true });
  });
};
