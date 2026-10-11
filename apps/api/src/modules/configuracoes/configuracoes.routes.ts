import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { z } from 'zod';

const atualizarConfigSchema = z.object({
  nomeLoja: z.string().min(2).max(100).optional(),
  cnpj: z.string().optional().nullable(),
  inscricaoEstadual: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  permitirVendaSemEstoque: z.boolean().optional(),
  impressoraNome: z.string().optional().nullable(),
  larguraCupomMm: z.enum(['58', '80']).or(z.number().int()).optional(),
  imprimirAuto: z.boolean().optional(),
  cabecalhoCupom: z.string().optional().nullable(),
  rodapeCupom: z.string().optional().nullable(),
  mensagemFinal: z.string().optional().nullable(),
  formasPagamentoAtivas: z.string().optional().nullable(),
});

export const configuracoesRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/configuracoes — qualquer autenticado
  app.get('/configuracoes', { preHandler: authenticate }, async (_req, reply) => {
    const config = await prisma.configuracao.findUnique({ where: { id: 'unica' } });
    return reply.send(config);
  });

  // PUT /api/configuracoes — ADMIN
  app.put('/configuracoes', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const parsed = atualizarConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const antes = await prisma.configuracao.findUnique({ where: { id: 'unica' } });
    if (!antes) return reply.code(404).send({ erro: 'Configuracao nao encontrada' });
    const atualizado = await prisma.configuracao.update({
      where: { id: 'unica' },
      data: parsed.data as any,
    });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CONFIGURACAO_ALTERADA',
      entidade: 'Configuracao', entidadeId: 'unica',
      dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
    });
    return reply.send(atualizado);
  });
};
