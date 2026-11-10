// OCR (etapa 4). Motor injetavel. A implementacao real usa tesseract.js em modo
// OFFLINE: exige o arquivo de idioma (ex.: por.traineddata) em um diretorio local
// (NFE_OCR_LANG_PATH). Se ele nao existir, falha com OcrIndisponivelError ANTES de
// criar o worker — o tesseract.js nunca tenta baixar nada da rede a partir daqui.
import { access } from 'node:fs/promises';
import path from 'node:path';

export interface ResultadoOcr {
  texto: string;
  /** confianca media 0..100 informada pelo motor */
  confianca: number;
}

export interface MotorOcr {
  reconhecer(imagem: Buffer): Promise<ResultadoOcr>;
  encerrar?(): Promise<void>;
}

export class OcrIndisponivelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrIndisponivelError';
  }
}

export interface OpcoesTesseract {
  langPath: string;
  lang?: string; // padrao: por
}

export function opcoesTesseractDoAmbiente(): OpcoesTesseract | null {
  const langPath = process.env.NFE_OCR_LANG_PATH;
  if (!langPath) return null;
  return { langPath: path.resolve(langPath), lang: process.env.NFE_OCR_LANG || 'por' };
}

export function criarMotorTesseract(opts: OpcoesTesseract): MotorOcr {
  const lang = opts.lang ?? 'por';
  let worker: any = null;
  let iniciando: Promise<any> | null = null;

  async function obter() {
    if (worker) return worker;
    iniciando ??= (async () => {
      const arquivo = path.join(opts.langPath, `${lang}.traineddata`);
      try {
        await access(arquivo);
      } catch {
        throw new OcrIndisponivelError(`dados de idioma ausentes: ${arquivo} (nao sera feito download automatico)`);
      }
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker(lang, 1, { langPath: opts.langPath, gzip: false, cacheMethod: 'none' } as any);
      return worker;
    })().catch((e) => { iniciando = null; throw e; });
    return iniciando;
  }

  return {
    async reconhecer(imagem) {
      const w = await obter();
      const r = await w.recognize(imagem);
      return { texto: String(r.data.text ?? ''), confianca: Number(r.data.confidence ?? 0) };
    },
    async encerrar() {
      if (worker) { await worker.terminate(); worker = null; iniciando = null; }
    },
  };
}
