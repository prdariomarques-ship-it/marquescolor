import type { PrismaClient } from '@prisma/client';

// Aceita tanto PrismaClient quanto o client de transacao (tx)
type PrismaLike = Pick<PrismaClient, 'auditoria'>;

interface RegistrarAuditoriaInput {
  usuarioId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
  ip?: string | null;
}

export async function registrarAuditoria(
  prisma: PrismaLike,
  dados: RegistrarAuditoriaInput,
): Promise<void> {
  try {
    await (prisma as any).auditoria.create({
      data: {
        usuarioId: dados.usuarioId || null,
        acao: dados.acao,
        entidade: dados.entidade,
        entidadeId: dados.entidadeId || null,
        dadosAntes: dados.dadosAntes ? JSON.stringify(dados.dadosAntes) : null,
        dadosDepois: dados.dadosDepois ? JSON.stringify(dados.dadosDepois) : null,
        ip: dados.ip || null,
      },
    });
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

/**
 * DEC214-2: auditoria OBRIGATORIA. Sem try/catch: deve ser chamada dentro da transacao que move o estoque,
 * para que uma falha de trilha desfaca o movimento (rollback) em vez de deixar movimento sem registro.
 */
export async function registrarAuditoriaObrigatoria(
  tx: PrismaLike,
  dados: RegistrarAuditoriaInput,
): Promise<void> {
  await (tx as any).auditoria.create({
    data: {
      usuarioId: dados.usuarioId || null,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId || null,
      dadosAntes: dados.dadosAntes ? JSON.stringify(dados.dadosAntes) : null,
      dadosDepois: dados.dadosDepois ? JSON.stringify(dados.dadosDepois) : null,
      ip: dados.ip || null,
    },
  });
}
