import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const backupRoutes: FastifyPluginAsync = async (app) => {
  // Exportar (gera JSON com todas as tabelas)
  app.get('/backup/exportar', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const dados: Record<string, any> = {};
    const tabelas = [
      'usuario', 'categoria', 'marca', 'produto', 'movimentacaoEstoque',
      'cliente', 'fornecedor', 'venda', 'itemVenda', 'pagamentoVenda',
      'caixaSessao', 'movimentacaoCaixa', 'compra', 'itemCompra',
      'orcamento', 'itemOrcamento', 'contaReceber', 'contaPagar',
      'configuracao', 'auditoria',
    ];
    for (const t of tabelas) {
      // @ts-ignore
      dados[t] = await (prisma as any)[t].findMany();
    }
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'BACKUP_EXPORTADO',
      entidade: 'Sistema', ip: req.ip,
    });
    reply.type('application/json').header('Content-Disposition', 'attachment; filename="backup-marquescollor.json"');
    return reply.send(dados);
  });

  // Restaurar (recebe JSON)
  app.post('/backup/restaurar', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const dados = req.body as Record<string, any[]>;
    if (!dados || typeof dados !== 'object') return reply.code(400).send({ erro: 'JSON invalido' });
    try {
      await prisma.$transaction(async (tx) => {
        // Ordem de restauracao: dependentes primeiro
        const ordem = [
          'configuracao', 'usuario', 'categoria', 'marca', 'fornecedor', 'cliente',
          'produto', 'movimentacaoEstoque', 'orcamento', 'itemOrcamento',
          'venda', 'itemVenda', 'pagamentoVenda', 'caixaSessao', 'movimentacaoCaixa',
          'compra', 'itemCompra', 'contaReceber', 'contaPagar', 'auditoria',
        ];
        for (const t of ordem) {
          if (!dados[t]) continue;
          // @ts-ignore
          await (tx as any)[t].deleteMany();
          for (const row of dados[t]) {
            // @ts-ignore
            await (tx as any)[t].create({ data: row });
          }
        }
      });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'BACKUP_RESTAURADO',
        entidade: 'Sistema', ip: req.ip,
      });
      return reply.send({ ok: true });
    } catch (e: any) { return reply.code(500).send({ erro: e.message }); }
  });
};
