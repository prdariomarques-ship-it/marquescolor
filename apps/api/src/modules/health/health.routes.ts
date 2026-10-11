import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    let banco = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      banco = true;
    } catch {
      banco = false;
    }

    return reply.send({
      ok: true,
      banco,
      loja: env.LOJA_NOME,
      versao: '0.1.0',
      hora: new Date().toISOString(),
    });
  });
};
