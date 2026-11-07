import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { z } from 'zod';

const tabelas = [
  'usuario', 'categoria', 'marca', 'produto', 'movimentacaoEstoque',
  'cliente', 'fornecedor', 'venda', 'itemVenda', 'pagamentoVenda',
  'caixaSessao', 'movimentacaoCaixa', 'compra', 'itemCompra',
  'orcamento', 'itemOrcamento', 'contaReceber', 'contaPagar',
  'configuracao', 'auditoria', 'metaMensal',
] as const;

const ordemExclusao = [
  'itemVenda', 'pagamentoVenda', 'itemOrcamento', 'itemCompra',
  'movimentacaoEstoque', 'movimentacaoCaixa', 'contaReceber', 'contaPagar',
  'venda', 'orcamento', 'compra', 'caixaSessao', 'produto',
  'cliente', 'fornecedor', 'categoria', 'marca', 'metaMensal',
  'auditoria', 'usuario', 'configuracao',
] as const;

const ordemRestauracao = [
  'configuracao', 'usuario', 'categoria', 'marca', 'fornecedor',
  'cliente', 'produto', 'caixaSessao', 'venda', 'orcamento', 'compra',
  'metaMensal', 'itemVenda', 'pagamentoVenda', 'itemOrcamento',
  'itemCompra', 'movimentacaoEstoque', 'movimentacaoCaixa',
  'contaReceber', 'contaPagar', 'auditoria',
] as const;

const envelopeSchema = z.object({
  format: z.literal('MARQUESCOLOR_BACKUP').optional(),
  version: z.number().int().positive().optional(),
  exportedAt: z.string().optional(),
  storeName: z.string().optional(),
  data: z.record(z.array(z.any())).optional(),
}).passthrough();

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/backup/exportar', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const data: Record<string, any[]> = {};
    for (const tabela of tabelas) {
      // Os delegates são definidos pelo schema Prisma e conferidos em runtime.
      // @ts-ignore
      data[tabela] = await (prisma as any)[tabela].findMany();
    }
    const config = data.configuracao.find((item: any) => item.id === 'unica');
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: 'BACKUP_EXPORTADO',
      entidade: 'Sistema',
      ip: req.ip,
    });
    return reply.send({
      format: 'MARQUESCOLOR_BACKUP',
      version: 1,
      exportedAt: new Date().toISOString(),
      storeName: config?.nomeLoja || 'Marquescollor Tintas',
      data,
    });
  });

  app.post('/backup/restaurar', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const parsed = envelopeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: 'Arquivo de backup inválido.' });

    const body = parsed.data as any;
    if (body.format && body.version !== 1) {
      return reply.code(400).send({ erro: 'Versão de backup não suportada.' });
    }
    const data = body.data || body; // Compatibilidade com backups JSON antigos.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return reply.code(400).send({ erro: 'Estrutura do backup inválida.' });
    }

    for (const key of Object.keys(data)) {
      if (!(tabelas as readonly string[]).includes(key)) {
        return reply.code(400).send({ erro: `Tabela desconhecida no backup: ${key}` });
      }
      if (!Array.isArray(data[key])) {
        return reply.code(400).send({ erro: `O conteúdo de ${key} não é uma lista válida.` });
      }
    }
    if (!data.configuracao || !data.configuracao.length) {
      return reply.code(400).send({ erro: 'O backup não contém a configuração da loja.' });
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const tabela of ordemExclusao) {
          // @ts-ignore
          await (tx as any)[tabela].deleteMany();
        }
        for (const tabela of ordemRestauracao) {
          const registros = data[tabela] || [];
          for (const registro of registros) {
            // @ts-ignore
            await (tx as any)[tabela].create({ data: registro });
          }
        }
      }, { timeout: 120000 });

      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id,
        acao: 'BACKUP_RESTAURADO',
        entidade: 'Sistema',
        ip: req.ip,
      });
      return reply.send({ ok: true, restauradas: Object.keys(data) });
    } catch (e: any) {
      req.log.error({ err: e }, 'Falha ao restaurar backup');
      return reply.code(400).send({ erro: 'Não foi possível restaurar. O banco foi mantido sem alterações pela transação.' });
    }
  });
};
