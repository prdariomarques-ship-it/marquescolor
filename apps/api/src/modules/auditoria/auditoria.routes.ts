import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';

export const auditoriaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auditoria', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const q = req.query as {
      acao?: string;
      entidade?: string;
      entidadeId?: string;
      usuarioId?: string;
      dataInicio?: string;
      dataFim?: string;
      page?: string;
      pageSize?: string;
    };

    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));

    const where: any = {};
    if (q.acao) where.acao = q.acao;
    if (q.entidade) where.entidade = q.entidade;
    if (q.entidadeId) where.entidadeId = q.entidadeId;
    if (q.usuarioId) where.usuarioId = q.usuarioId;
    if (q.dataInicio || q.dataFim) {
      where.criadoEm = {};
      if (q.dataInicio) where.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.criadoEm.lte = new Date(q.dataFim);
    }

    const [total, registros] = await Promise.all([
      prisma.auditoria.count({ where }),
      prisma.auditoria.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return reply.send({
      data: registros,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });
};
