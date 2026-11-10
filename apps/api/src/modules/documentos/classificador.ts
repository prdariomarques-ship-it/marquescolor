// Identificacao do tipo real do arquivo por ASSINATURA (magic bytes), nunca so por
// extensao/MIME (que sao informados pelo remetente e podem mentir).
export type TipoArquivo = 'XML' | 'PDF' | 'PNG' | 'JPEG' | 'OUTRO';

export function detectarTipoArquivo(bytes: Buffer): TipoArquivo {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // BOM
  const inicio = bytes.subarray(i, i + 256).toString('latin1').trimStart();
  if (inicio.startsWith('<?xml') || inicio.startsWith('<')) return 'XML';
  return 'OUTRO';
}

export type TipoDocumentoDetectado = 'XML_NFE' | 'PDF_TEXTO' | 'PDF_ESCANEADO' | 'IMAGEM' | 'OUTRO';

/** Categoria de mensagem de e-mail (heuristica por palavras-chave; nao e validacao fiscal). */
export type CategoriaEmail = 'NF_E' | 'FINANCEIRO' | 'PEDIDO_FORNECEDOR' | 'SPAM' | 'DESCONHECIDO';
