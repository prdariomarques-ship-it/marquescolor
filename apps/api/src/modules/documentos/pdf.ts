// PDF: texto nativo e renderizacao de paginas (pdfjs-dist + @napi-rs/canvas).
// Etapas 2 e 3 do pipeline hibrido. Funciona so com bibliotecas locais, sem rede.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PdfPorta {
  /** texto nativo por pagina (linhas reconstruidas pela posicao vertical) */
  extrairTexto(bytes: Buffer): Promise<{ paginas: string[]; totalPaginas: number }>;
  /** renderiza paginas em PNG (para OCR) */
  renderizarPaginas(bytes: Buffer, opts?: { escala?: number; maxPaginas?: number }): Promise<Buffer[]>;
}

export const MAX_PAGINAS = 30;

let pdfjsPromise: Promise<any> | null = null;
function carregarPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

function standardFontsUrl(): string {
  const req = createRequire(import.meta.url);
  const dir = path.join(path.dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts');
  return pathToFileURL(dir + path.sep).href;
}

async function abrir(bytes: Buffer) {
  const pdfjs = await carregarPdfjs();
  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: standardFontsUrl(),
    verbosity: 0,
  });
  return tarefa.promise;
}

function linhasDaPagina(items: any[]): string {
  // agrupa por coordenada Y (tolerancia 2pt) e ordena por X
  const linhas: { y: number; partes: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str === '') continue;
    const x = it.transform[4] as number;
    const y = it.transform[5] as number;
    let linha = linhas.find((l) => Math.abs(l.y - y) <= 2);
    if (!linha) { linha = { y, partes: [] }; linhas.push(linha); }
    linha.partes.push({ x, s: it.str });
  }
  linhas.sort((a, b) => b.y - a.y);
  return linhas.map((l) => l.partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

export const pdfPadrao: PdfPorta = {
  async extrairTexto(bytes) {
    const doc = await abrir(bytes);
    try {
      const total: number = doc.numPages;
      const paginas: string[] = [];
      for (let n = 1; n <= Math.min(total, MAX_PAGINAS); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        paginas.push(linhasDaPagina(content.items as any[]));
        page.cleanup();
      }
      return { paginas, totalPaginas: total };
    } finally {
      await doc.destroy();
    }
  },

  async renderizarPaginas(bytes, opts = {}) {
    const { createCanvas } = await import('@napi-rs/canvas');
    const doc = await abrir(bytes);
    try {
      const escala = opts.escala ?? 2.5; // ~180 dpi
      const max = Math.min(opts.maxPaginas ?? MAX_PAGINAS, MAX_PAGINAS);
      const out: Buffer[] = [];
      for (let n = 1; n <= Math.min(doc.numPages, max); n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: escala });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx as any, canvas: canvas as any, viewport }).promise;
        out.push(canvas.toBuffer('image/png'));
        page.cleanup();
      }
      return out;
    } finally {
      await doc.destroy();
    }
  },
};
