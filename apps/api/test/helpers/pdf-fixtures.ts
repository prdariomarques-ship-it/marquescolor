// Geradores SINTETICOS de PDF/imagem para testes (sem rede, sem documentos reais).
import { createCanvas } from '@napi-rs/canvas';

function montarPdf(objetos: (Buffer | string)[]): Buffer {
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let pos = partes[0].length;
  objetos.forEach((o, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
    partes.push(b);
    pos += b.length;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

/** PDF com TEXTO nativo (Helvetica), uma lista de linhas por pagina. Apenas ASCII. */
export function pdfComTexto(paginas: string[][]): Buffer {
  const n = paginas.length;
  const objetos: (Buffer | string)[] = [];
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
  objetos.push(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`);
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  paginas.forEach((linhas, i) => {
    const conteudo = `BT /F1 10 Tf 12 TL 40 800 Td ${linhas.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) '`).join(' ')} ET`;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objetos.push(`<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`);
  });
  return montarPdf(objetos);
}

/** Imagem (PNG/JPEG) com linhas de texto desenhadas (para PDFs escaneados / OCR real). */
export function imagemComTexto(linhas: string[], formato: 'png' | 'jpeg' = 'png', largura = 1240, altura = 1754): Buffer {
  const canvas = createCanvas(largura, altura);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.fillStyle = '#000000';
  ctx.font = '34px sans-serif';
  linhas.forEach((l, i) => ctx.fillText(l, 60, 90 + i * 52));
  return formato === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 92);
}

/** PDF "escaneado": cada pagina e so uma imagem JPEG (sem texto nativo). */
export function pdfSoImagem(jpegs: { dados: Buffer; largura: number; altura: number }[]): Buffer {
  const n = jpegs.length;
  const objetos: (Buffer | string)[] = [];
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
  objetos.push(`<< /Type /Pages /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`);
  jpegs.forEach((j, i) => {
    const w = 595;
    const h = Math.round((595 * j.altura) / j.largura);
    const conteudo = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${5 + i * 3} 0 R >> >> /Contents ${4 + i * 3} 0 R >>`);
    objetos.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    objetos.push(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${j.largura} /Height ${j.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.dados.length} >>\nstream\n`, 'latin1'),
      j.dados,
      Buffer.from('\nendstream', 'latin1'),
    ]));
  });
  return montarPdf(objetos);
}

/** Linhas de um DANFE sintetico (texto), compativel com o leitor de DANFE. */
export function linhasDanfe(o: { chave: string; numero: number; serie: number; itens: { cod: string; desc: string; ncm: string; csosn: string; cfop: string; un: string; qtd: string; unit: string; total: string }[]; totalProdutos: string; totalNota: string; cnpjEmit?: string; cnpjDest?: string }): string[] {
  const ch = o.chave.replace(/(\d{4})(?=\d)/g, '$1 ');
  return [
    'RECEBEMOS DE DISTRIBUIDORA FICTICIA DE TINTAS LTDA OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO',
    `DANFE N. ${String(o.numero).padStart(9, '0')} SERIE ${o.serie}`,
    `CHAVE DE ACESSO ${ch}`,
    'EMISSAO: 20/10/2026',
    `CNPJ ${o.cnpjEmit ?? '11.222.333/0001-81'}`,
    `DESTINATARIO CNPJ ${o.cnpjDest ?? '17.758.633/0001-66'}`,
    'CODIGO DESCRICAO NCM CST CFOP UN QUANT VALOR UNIT VALOR TOTAL',
    ...o.itens.map((i) => `${i.cod} ${i.desc} ${i.ncm} ${i.csosn} ${i.cfop} ${i.un} ${i.qtd} ${i.unit} ${i.total}`),
    `VALOR TOTAL DOS PRODUTOS ${o.totalProdutos}`,
    `VALOR TOTAL DA NOTA ${o.totalNota}`,
  ];
}
