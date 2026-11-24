// E-mail -> identificacao de anexos -> classificacao -> ingestao dos documentos.
// Duplicidade: por Message-ID (e por SHA-256 de cada anexo, em nfe/ingestao.ts).
// Indisponibilidade da caixa: retentativas com espera crescente; mensagem so e
// marcada como processada DEPOIS de gravada (falha ao marcar nao perde dados).
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { detectarTipoArquivo } from '../documentos/classificador.js';
import type { DepsDocumentos } from '../documentos/pipeline.js';
import { ingerirArquivo } from '../nfe/ingestao.js';
import { abrirRevisao, registrarLog, type Ctx } from '../nfe/log.js';
import { classificarEmail } from './classificador.js';
import type { EmailBruto, EmailSource } from './tipos.js';

export interface ResultadoEmail {
  emailId: string;
  duplicado: boolean;
  status: string;
  categoria: string;
  documentoIds: string[];
  arquivos: { nome: string; arquivoId?: string; status?: string; duplicado?: boolean; ignorado?: string }[];
}

export async function ingerirEmail(ctx: Ctx, deps: DepsDocumentos, raw: EmailBruto, rotulo: string | null = null): Promise<ResultadoEmail> {
  const existente = await prisma.emailMensagem.findUnique({ where: { messageId: raw.messageId }, include: { documentos: { select: { id: true } } } });
  if (existente && existente.status !== 'RECEBIDO') {
    await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: existente.id, acao: 'SKIP_DUPLICATE_EMAIL', mensagem: `Message-ID ${raw.messageId} ja ingerido` });
    return { emailId: existente.id, duplicado: true, status: existente.status, categoria: existente.categoria, documentoIds: existente.documentos.map((d) => d.id), arquivos: [] };
  }

  let email;
  try {
    // status RECEBIDO = ingestao interrompida antes de concluir: retoma (anexos ja gravados sao deduplicados por SHA-256)
    email = existente ?? await prisma.emailMensagem.create({
      data: {
        messageId: raw.messageId, conta: rotulo, remetente: raw.remetente, remetenteNome: raw.remetenteNome, destinatario: raw.destinatario,
        assunto: raw.assunto?.slice(0, 500) ?? null, recebidoEm: raw.recebidoEm, status: 'RECEBIDO',
        origemHandle: raw.handle === undefined ? null : String(raw.handle),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const outro = await prisma.emailMensagem.findUniqueOrThrow({ where: { messageId: raw.messageId }, include: { documentos: { select: { id: true } } } });
      return { emailId: outro.id, duplicado: true, status: outro.status, categoria: outro.categoria, documentoIds: outro.documentos.map((d) => d.id), arquivos: [] };
    }
    throw e;
  }
  await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: email.id, acao: 'EMAIL_RECEBIDO', mensagem: `${raw.remetente}: ${raw.assunto ?? '(sem assunto)'}`, detalhe: { anexos: raw.anexos.map((a) => a.nome) } });

  const documentoIds: string[] = [];
  const arquivos: ResultadoEmail['arquivos'] = [];
  let houveErro = false;
  let processouDocumento = false;

  for (const anexo of raw.anexos) {
    const tipo = detectarTipoArquivo(anexo.conteudo);
    if (tipo === 'OUTRO') {
      arquivos.push({ nome: anexo.nome, ignorado: 'tipo nao suportado' });
      await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: email.id, acao: 'ANEXO_IGNORADO', mensagem: `${anexo.nome}: tipo nao suportado (${anexo.mime})` });
      continue;
    }
    try {
      const r = await ingerirArquivo(ctx, deps, { bytes: anexo.conteudo, nome: anexo.nome, mime: anexo.mime, origem: 'EMAIL', emailId: email.id });
      arquivos.push({ nome: anexo.nome, arquivoId: r.arquivoId, status: r.status, duplicado: r.duplicado });
      documentoIds.push(...r.documentoIds);
      if (r.documentoIds.length) processouDocumento = true;
      if (r.status === 'FALHA' && !r.duplicado) houveErro = true;
    } catch (e: any) {
      houveErro = true;
      arquivos.push({ nome: anexo.nome, status: 'FALHA' });
      await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: email.id, acao: 'ANEXO_FALHA', status: 'ERROR', mensagem: `${anexo.nome}: ${String(e?.message ?? e)}` });
    }
  }

  const remetenteConhecido = !!(await prisma.fornecedor.findFirst({ where: { email: raw.remetente } }));
  const cls = processouDocumento
    ? { categoria: 'NF_E' as const, confianca: 0.98, palavras: [] as string[] }
    : classificarEmail({ assunto: raw.assunto, corpo: raw.corpoTexto, temAnexoDocumento: raw.anexos.some((a) => detectarTipoArquivo(a.conteudo) !== 'OUTRO'), remetenteConhecido });
  let status = houveErro ? 'ERRO' : 'PROCESSADO';
  if (cls.categoria === 'DESCONHECIDO' && !houveErro) {
    status = 'REVISAO_HUMANA';
    await abrirRevisao(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: email.id, motivo: 'EMAIL_NAO_CLASSIFICADO', severidade: 'ALERTA', detalhe: `De ${raw.remetente}: ${raw.assunto ?? '(sem assunto)'}` });
  }
  await prisma.emailMensagem.update({
    where: { id: email.id },
    data: { categoria: cls.categoria, confianca: cls.confianca, status, processadoEm: new Date(), erro: houveErro ? 'um ou mais anexos falharam; ver historico de processamento' : null },
  });
  await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: email.id, acao: 'EMAIL_CLASSIFICADO', status: houveErro ? 'WARN' : 'OK', mensagem: `${cls.categoria} (${cls.confianca})`, detalhe: { palavras: cls.palavras } });
  return { emailId: email.id, duplicado: false, status, categoria: cls.categoria, documentoIds: [...new Set(documentoIds)], arquivos };
}

// ---------------------------------------------------------------- sincronizacao com retentativas

export type Dormir = (ms: number) => Promise<void>;
const dormirPadrao: Dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function comRetentativas<T>(fn: () => Promise<T>, o: { tentativas?: number; baseMs?: number; dormir?: Dormir; aoFalhar?: (e: unknown, n: number) => void } = {}): Promise<T> {
  const tentativas = o.tentativas ?? 3;
  let ultimo: unknown;
  for (let n = 1; n <= tentativas; n++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      o.aoFalhar?.(e, n);
      if (n < tentativas) await (o.dormir ?? dormirPadrao)((o.baseMs ?? 1000) * 2 ** (n - 1));
    }
  }
  throw ultimo;
}

export interface ResultadoSincronizacao {
  ok: boolean;
  buscados: number;
  processados: number;
  duplicados: number;
  falhas: number;
  erro?: string;
}

export async function sincronizarCaixa(ctx: Ctx, deps: DepsDocumentos, fonte: EmailSource, opcoes: { dormir?: Dormir; tentativas?: number; baseMs?: number } = {}): Promise<ResultadoSincronizacao> {
  let emails: EmailBruto[];
  try {
    emails = await comRetentativas(() => fonte.buscarNaoProcessados(), {
      tentativas: opcoes.tentativas, baseMs: opcoes.baseMs, dormir: opcoes.dormir,
      aoFalhar: (e, n) => { void registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', acao: 'CAIXA_INDISPONIVEL', status: 'WARN', mensagem: `tentativa ${n}: ${String((e as any)?.message ?? e)}` }); },
    });
  } catch (e: any) {
    await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', acao: 'SINCRONIZACAO_FALHOU', status: 'ERROR', mensagem: String(e?.message ?? e) });
    return { ok: false, buscados: 0, processados: 0, duplicados: 0, falhas: 0, erro: 'Caixa de e-mail indisponivel; nada foi processado e a proxima sincronizacao tentara de novo' };
  }
  const r: ResultadoSincronizacao = { ok: true, buscados: emails.length, processados: 0, duplicados: 0, falhas: 0 };
  for (const raw of emails) {
    try {
      const res = await ingerirEmail(ctx, deps, raw, fonte.rotulo);
      if (res.duplicado) r.duplicados += 1; else r.processados += 1;
      try {
        await fonte.marcarProcessado(raw);
      } catch (e: any) {
        await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', entidadeId: res.emailId, acao: 'MARCAR_PROCESSADO_FALHOU', status: 'WARN', mensagem: String(e?.message ?? e) });
      }
    } catch (e: any) {
      r.falhas += 1; // nao marca: sera tentado de novo na proxima sincronizacao
      await registrarLog(prisma, ctx, { entidadeTipo: 'EMAIL', acao: 'EMAIL_FALHA_INGESTAO', status: 'ERROR', mensagem: `${raw.messageId}: ${String(e?.message ?? e)}` });
    }
  }
  return r;
}
