// Historico de processamento (ProcessingLog) e fila de revisao humana (ReviewQueueItem).
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface Ctx {
  correlationId: string;
  usuarioId?: string | null;
  ip?: string | null;
}

export function novoContexto(parcial: Partial<Ctx> = {}): Ctx {
  return { correlationId: parcial.correlationId ?? randomUUID(), usuarioId: parcial.usuarioId ?? null, ip: parcial.ip ?? null };
}

export type StatusLog = 'OK' | 'WARN' | 'ERROR';

export async function registrarLog(
  db: Db,
  ctx: Ctx,
  d: { entidadeTipo: string; entidadeId?: string | null; acao: string; status?: StatusLog; mensagem?: string | null; detalhe?: unknown },
): Promise<void> {
  await db.processingLog.create({
    data: {
      correlationId: ctx.correlationId,
      entidadeTipo: d.entidadeTipo,
      entidadeId: d.entidadeId ?? null,
      acao: d.acao,
      status: d.status ?? 'OK',
      mensagem: d.mensagem ?? null,
      detalheJson: d.detalhe === undefined ? null : JSON.stringify(d.detalhe),
      usuarioId: ctx.usuarioId ?? null,
    },
  });
}

export type Severidade = 'BLOQUEANTE' | 'ALERTA';

export interface RevisaoDesejada {
  documentoId?: string | null;
  entidadeTipo: 'EMAIL' | 'ARQUIVO' | 'NFE' | 'NFE_ITEM';
  entidadeId: string;
  motivo: string;
  ref?: string;
  severidade: Severidade;
  detalhe?: string;
  dados?: unknown;
}

/**
 * Cria o item de revisao se ainda nao existir (idempotente pela chave
 * entidadeTipo+entidadeId+motivo+ref). Itens ja RESOLVIDOS/DISPENSADOS por
 * decisao humana NAO sao reabertos.
 */
export async function abrirRevisao(db: Db, ctx: Ctx, r: RevisaoDesejada) {
  const ref = r.ref ?? '';
  const existente = await db.reviewQueueItem.findUnique({
    where: { entidadeTipo_entidadeId_motivo_ref: { entidadeTipo: r.entidadeTipo, entidadeId: r.entidadeId, motivo: r.motivo, ref } },
  });
  if (existente) {
    // Itens fechados AUTOMATICAMENTE (sem decisao humana) reabrem se a condicao voltar a existir.
    // Decisoes humanas (resolvidoPorId preenchido) nunca sao reabertas.
    if (existente.status === 'RESOLVIDO' && !existente.resolvidoPorId && !MOTIVOS_MANUAIS.has(existente.motivo)) {
      const reaberto = await db.reviewQueueItem.update({
        where: { id: existente.id },
        data: { status: 'ABERTO', resolucao: null, resolvidoEm: null, detalhe: r.detalhe ?? existente.detalhe, dadosJson: r.dados === undefined ? existente.dadosJson : JSON.stringify(r.dados) },
      });
      await registrarLog(db, ctx, { entidadeTipo: r.entidadeTipo, entidadeId: r.entidadeId, acao: 'REVISAO_REABERTA', status: 'WARN', mensagem: r.motivo });
      return { item: reaberto, criado: false };
    }
    return { item: existente, criado: false };
  }
  const item = await db.reviewQueueItem.create({
    data: {
      documentoId: r.documentoId ?? null,
      entidadeTipo: r.entidadeTipo,
      entidadeId: r.entidadeId,
      motivo: r.motivo,
      ref,
      severidade: r.severidade,
      detalhe: r.detalhe ?? null,
      dadosJson: r.dados === undefined ? null : JSON.stringify(r.dados),
    },
  });
  await registrarLog(db, ctx, {
    entidadeTipo: r.entidadeTipo,
    entidadeId: r.entidadeId,
    acao: 'ENVIADO_PARA_REVISAO',
    status: r.severidade === 'BLOQUEANTE' ? 'WARN' : 'OK',
    mensagem: `${r.motivo}${r.detalhe ? `: ${r.detalhe}` : ''}`,
  });
  return { item, criado: true };
}

/**
 * Reconcilia os itens ABERTOS de um documento com o conjunto desejado: o que
 * deixou de ser verdadeiro (ex.: produto vinculado) e fechado automaticamente
 * como RESOLVIDO/AUTO; o que e novo e aberto. Decisoes humanas nao sao tocadas.
 */
export async function sincronizarRevisoes(db: Db, ctx: Ctx, documentoId: string, desejadas: RevisaoDesejada[]) {
  const chave = (x: { entidadeTipo: string; entidadeId: string; motivo: string; ref?: string | null }) =>
    `${x.entidadeTipo}|${x.entidadeId}|${x.motivo}|${x.ref ?? ''}`;
  const conjunto = new Set(desejadas.map(chave));
  for (const r of desejadas) await abrirRevisao(db, ctx, { ...r, documentoId });
  const abertas = await db.reviewQueueItem.findMany({ where: { documentoId, status: 'ABERTO' } });
  for (const a of abertas) {
    // itens gerados fora do calculo automatico (ex.: FALHA_INTEGRACAO_ESTOQUE) so a acao humana/fluxo fecha
    if (MOTIVOS_MANUAIS.has(a.motivo)) continue;
    if (!conjunto.has(chave(a))) {
      await db.reviewQueueItem.update({
        where: { id: a.id },
        data: { status: 'RESOLVIDO', resolucao: 'AUTO_REPROCESSAMENTO: condicao deixou de existir', resolvidoEm: new Date() },
      });
      await registrarLog(db, ctx, { entidadeTipo: a.entidadeTipo, entidadeId: a.entidadeId, acao: 'REVISAO_FECHADA_AUTO', mensagem: a.motivo });
    }
  }
}

export const MOTIVOS_MANUAIS = new Set(['FALHA_INTEGRACAO_ESTOQUE', 'EVENTO_FISCAL_CANCELAMENTO', 'EVENTO_FISCAL_RECEBIDO', 'DIVERGENCIA_QUANTIDADE_RECEBIMENTO']);
