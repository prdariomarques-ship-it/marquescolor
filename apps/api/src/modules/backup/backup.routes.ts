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
  // Fase 5 (NF-e): opcionais em backups antigos. Arquivos ORIGINAIS (XML/PDF) ficam em
  // NFE_STORAGE_DIR e devem ser copiados junto (o backup JSON guarda so metadados + SHA-256).
  'emailMensagem', 'documentoArquivo', 'nfeDocument', 'nfeItem', 'produtoFornecedorMap', 'reviewQueueItem', 'processingLog',
] as const;

const tabelasOpcionais = new Set<string>([
  'metaMensal', 'emailMensagem', 'documentoArquivo', 'nfeDocument', 'nfeItem', 'produtoFornecedorMap', 'reviewQueueItem', 'processingLog',
]);

const ordemExclusao = [
  'processingLog', 'reviewQueueItem', 'nfeItem', 'produtoFornecedorMap', 'nfeDocument', 'documentoArquivo', 'emailMensagem',
  'itemVenda', 'pagamentoVenda', 'itemOrcamento', 'itemCompra',
  'movimentacaoEstoque', 'movimentacaoCaixa', 'contaReceber', 'contaPagar',
  'venda', 'orcamento', 'compra', 'caixaSessao', 'produto',
  'cliente', 'fornecedor', 'categoria', 'marca', 'metaMensal',
  'auditoria', 'refreshToken', 'usuario', 'configuracao',
] as const;

const ordemRestauracao = [
  'configuracao', 'usuario', 'categoria', 'marca', 'fornecedor',
  'cliente', 'produto', 'caixaSessao', 'venda', 'orcamento', 'compra',
  'metaMensal', 'emailMensagem', 'documentoArquivo', 'nfeDocument', 'nfeItem', 'produtoFornecedorMap', 'reviewQueueItem', 'processingLog',
  'itemVenda', 'pagamentoVenda', 'itemOrcamento',
  'itemCompra', 'movimentacaoEstoque', 'movimentacaoCaixa',
  'contaReceber', 'contaPagar', 'auditoria',
] as const;

const camposDateTime = new Set([
  'ultimoLogin', 'criadoEm', 'atualizadoEm', 'expiraEm', 'canceladaEm',
  'abertoEm', 'fechadoEm', 'dataCompra', 'validade', 'vencimento', 'pagoEm',
  'recebidoEm', 'processadoEm', 'dataEmissao', 'aprovadoEm', 'rejeitadoEm', 'recebimentoFisicoEm', 'estoqueAtualizadoEm', 'resolvidoEm',
]);
const camposDateTimeOpcionais = new Set([
  'ultimoLogin', 'canceladaEm', 'fechadoEm', 'validade', 'pagoEm',
  'processadoEm', 'dataEmissao', 'aprovadoEm', 'rejeitadoEm', 'recebimentoFisicoEm', 'estoqueAtualizadoEm', 'resolvidoEm',
]);

function normalizarDatasRegistro(registro: Record<string, any>): Record<string, any> {
  const normalizado = { ...registro };
  for (const campo of camposDateTime) {
    const valor = normalizado[campo];
    if (valor === null || valor === undefined) continue;
    if (valor === '' && camposDateTimeOpcionais.has(campo)) {
      normalizado[campo] = null;
      continue;
    }
    if (typeof valor === 'string' || typeof valor === 'number') {
      const data = new Date(valor);
      if (Number.isNaN(data.getTime())) throw new Error(`Data inválida no campo ${campo}.`);
      normalizado[campo] = data;
    } else if (!(valor instanceof Date)) {
      throw new Error(`Formato de data inválido no campo ${campo}.`);
    }
  }
  return normalizado;
}

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
    bodyLimit: 50 * 1024 * 1024,
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
    // Só tabelas de módulos adicionados depois (metas, NF-e) podem faltar em backups antigos.
    const obrigatorias = tabelas.filter(tabela => !tabelasOpcionais.has(tabela));
    const ausentes = obrigatorias.filter(tabela => !Object.prototype.hasOwnProperty.call(data, tabela));
    if (ausentes.length) {
      return reply.code(400).send({ erro: `Backup incompleto. Tabelas ausentes: ${ausentes.join(', ')}` });
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
            await (tx as any)[tabela].create({ data: normalizarDatasRegistro(registro) });
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
