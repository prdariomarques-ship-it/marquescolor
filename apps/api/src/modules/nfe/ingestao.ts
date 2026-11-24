// Orquestra: arquivo recebido -> original preservado -> pipeline hibrido -> NF-e
// persistida (ou revisao humana). Idempotente: o mesmo arquivo (SHA-256) nunca gera
// dois documentos; reprocessar devolve os mesmos IDs.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { lerOriginal, salvarOriginal, sha256 } from '../documentos/armazenamento.js';
import { executarPipeline, type DepsDocumentos, type ResultadoPipeline } from '../documentos/pipeline.js';
import { abrirRevisao, registrarLog, type Ctx } from './log.js';
import { persistirExtracao, registrarEventoFiscal } from './servico.js';

export interface EntradaArquivo {
  bytes: Buffer;
  nome: string;
  mime: string;
  origem: 'EMAIL' | 'UPLOAD';
  emailId?: string | null;
}

export interface ResultadoIngestao {
  arquivoId: string;
  duplicado: boolean;
  status: string;
  tipoDetectado: string;
  metodo: string | null;
  documentoIds: string[];
  acao?: string;
  erro?: { codigo: string; mensagem: string };
  etapas: ResultadoPipeline['etapas'];
}

const TAMANHO_MAXIMO = 15 * 1024 * 1024;

export async function ingerirArquivo(ctx: Ctx, deps: DepsDocumentos, entrada: EntradaArquivo): Promise<ResultadoIngestao> {
  if (entrada.bytes.length === 0) {
    return { arquivoId: '', duplicado: false, status: 'FALHA', tipoDetectado: 'OUTRO', metodo: null, documentoIds: [], etapas: [], erro: { codigo: 'ARQUIVO_VAZIO', mensagem: 'Arquivo vazio' } };
  }
  if (entrada.bytes.length > TAMANHO_MAXIMO) {
    return { arquivoId: '', duplicado: false, status: 'FALHA', tipoDetectado: 'OUTRO', metodo: null, documentoIds: [], etapas: [], erro: { codigo: 'ARQUIVO_GRANDE_DEMAIS', mensagem: 'Arquivo excede 15 MB' } };
  }
  const hash = sha256(entrada.bytes);
  const existente = await prisma.documentoArquivo.findUnique({ where: { sha256: hash }, include: { documentos: { select: { id: true } } } });
  if (existente) {
    await registrarLog(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: existente.id, acao: 'SKIP_DUPLICATE_ARQUIVO', mensagem: `${entrada.nome}: mesmo conteudo (SHA-256) ja recebido` });
    return {
      arquivoId: existente.id, duplicado: true, status: existente.status, tipoDetectado: existente.tipoDetectado,
      metodo: existente.metodoExtracao, documentoIds: existente.documentos.map((d) => d.id), etapas: [],
    };
  }

  const salvo = await salvarOriginal(entrada.bytes, entrada.nome);
  let arquivo;
  try {
    arquivo = await prisma.documentoArquivo.create({
      data: {
        emailId: entrada.emailId ?? null, origem: entrada.origem, nomeOriginal: entrada.nome.slice(0, 255), mimeType: entrada.mime || 'application/octet-stream',
        tamanhoBytes: entrada.bytes.length, sha256: salvo.sha256, caminho: salvo.caminho, tipoDetectado: 'OUTRO', usuarioId: ctx.usuarioId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // corrida: outro processamento gravou o mesmo arquivo
      const outro = await prisma.documentoArquivo.findUniqueOrThrow({ where: { sha256: hash }, include: { documentos: { select: { id: true } } } });
      return { arquivoId: outro.id, duplicado: true, status: outro.status, tipoDetectado: outro.tipoDetectado, metodo: outro.metodoExtracao, documentoIds: outro.documentos.map((d) => d.id), etapas: [] };
    }
    throw e;
  }
  await registrarLog(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivo.id, acao: 'ARQUIVO_RECEBIDO', mensagem: `${entrada.nome} (${entrada.bytes.length} bytes) origem ${entrada.origem}`, detalhe: { sha256: hash } });
  return processarArquivo(ctx, deps, arquivo.id, entrada.bytes);
}

/** Reexecuta o pipeline sobre o ORIGINAL preservado (ex.: apos recuperar o OCR). Idempotente. */
export async function reprocessarArquivo(ctx: Ctx, deps: DepsDocumentos, arquivoId: string): Promise<ResultadoIngestao> {
  const arquivo = await prisma.documentoArquivo.findUnique({ where: { id: arquivoId } });
  if (!arquivo) throw new Error('Arquivo nao encontrado');
  const bytes = await lerOriginal(arquivo.caminho);
  if (sha256(bytes) !== arquivo.sha256) throw new Error('Integridade do arquivo original comprometida (SHA-256 difere)');
  await registrarLog(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivo.id, acao: 'REPROCESSAMENTO_SOLICITADO' });
  return processarArquivo(ctx, deps, arquivo.id, bytes);
}

async function processarArquivo(ctx: Ctx, deps: DepsDocumentos, arquivoId: string, bytes: Buffer): Promise<ResultadoIngestao> {
  const documentoIds: string[] = [];
  let r: ResultadoPipeline | null = null;
  try {
    r = await executarPipeline(bytes, deps);
    for (const e of r.etapas) {
      await registrarLog(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, acao: `ETAPA_${e.etapa}`, status: e.status === 'FALHA' ? 'WARN' : 'OK', mensagem: `${e.status}${e.detalhe ? `: ${e.detalhe}` : ''}` });
    }

    let status = 'SEM_DADOS';
    let acao: string | undefined;
    let erro = r.erro;

    if (r.xml?.tipo === 'EVENTO') {
      const ev = await registrarEventoFiscal(ctx, { chave: r.xml.chave ?? null, tipoEvento: r.xml.evento?.tipoEvento ?? null, descricao: r.xml.evento?.descricao ?? null }, arquivoId);
      if (ev.documentoId) documentoIds.push(ev.documentoId);
      status = 'INTERPRETADO';
      acao = 'EVENTO_REGISTRADO';
    } else if (r.xml?.tipo === 'RESUMO') {
      await abrirRevisao(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: 'ARQUIVO_SEM_DADOS', severidade: 'ALERTA', detalhe: `XML de resumo (resNFe) da chave ${r.xml.chave ?? '?'} nao traz itens; obtenha o XML completo (procNFe).` });
      erro = { codigo: 'XML_RESUMO', mensagem: 'XML de resumo sem itens' };
    } else if (r.nfe && r.nfe.itens.length > 0) {
      const p = await persistirExtracao(ctx, r.nfe, { arquivoId, emailId: (await prisma.documentoArquivo.findUnique({ where: { id: arquivoId }, select: { emailId: true } }))?.emailId ?? null });
      documentoIds.push(p.documentoId);
      status = 'INTERPRETADO';
      acao = p.acao;
      erro = undefined;
    } else if (r.nfe) {
      await abrirRevisao(prisma, ctx, {
        entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: 'ARQUIVO_SEM_DADOS', severidade: 'BLOQUEANTE',
        detalhe: `Leitura de ${r.metodo} encontrou a chave ${r.nfe.chaveAcesso ?? '?'} mas nenhum item; conferir/lancar manualmente a partir do original.`, dados: { avisos: r.nfe.avisos },
      });
      erro = { codigo: 'SEM_ITENS', mensagem: 'Itens nao reconhecidos' };
    } else if (r.erro) {
      status = r.erro.codigo === 'SEM_DADOS_EXTRAIDOS' ? 'SEM_DADOS' : 'FALHA';
      await abrirRevisao(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: 'ARQUIVO_SEM_DADOS', severidade: 'BLOQUEANTE', detalhe: `${r.erro.codigo}: ${r.erro.mensagem}` });
    }
    if (status === 'INTERPRETADO') {
      await prisma.reviewQueueItem.updateMany({ where: { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: { in: ['ARQUIVO_SEM_DADOS', 'FALHA_PROCESSAMENTO'] }, status: 'ABERTO' }, data: { status: 'RESOLVIDO', resolucao: 'AUTO_REPROCESSAMENTO: dados extraidos', resolvidoEm: new Date() } });
    }
    await prisma.documentoArquivo.update({
      where: { id: arquivoId },
      data: { tipoDetectado: r.tipoDetectado, status, metodoExtracao: r.metodo, erro: erro ? `${erro.codigo}: ${erro.mensagem}` : null },
    });
    return { arquivoId, duplicado: false, status, tipoDetectado: r.tipoDetectado, metodo: r.metodo, documentoIds, acao, erro, etapas: r.etapas };
  } catch (e: any) {
    // falha inesperada: nunca perder o arquivo; ele vai para a fila de revisao
    await registrarLog(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, acao: 'FALHA_PROCESSAMENTO', status: 'ERROR', mensagem: String(e?.message ?? e) });
    await prisma.documentoArquivo.update({ where: { id: arquivoId }, data: { status: 'FALHA', erro: `FALHA_PROCESSAMENTO: ${String(e?.message ?? e).slice(0, 500)}` } });
    await abrirRevisao(prisma, ctx, { entidadeTipo: 'ARQUIVO', entidadeId: arquivoId, motivo: 'FALHA_PROCESSAMENTO', severidade: 'BLOQUEANTE', detalhe: String(e?.message ?? e).slice(0, 500) });
    return { arquivoId, duplicado: false, status: 'FALHA', tipoDetectado: r?.tipoDetectado ?? 'OUTRO', metodo: null, documentoIds, erro: { codigo: 'FALHA_PROCESSAMENTO', mensagem: String(e?.message ?? e) }, etapas: r?.etapas ?? [] };
  }
}
