// Pipeline documental HIBRIDO, nesta ordem (cada etapa so roda se a anterior nao
// produziu uma NF-e utilizavel):
//   1) XML estruturado  2) texto nativo de PDF  3) renderizacao de PDF escaneado
//   4) OCR              5) interpretacao multimodal (opcional, desligada por padrao)
//   6) normalizacao     7) validacao (divergencias, no servico)  8) revisao humana
// Cada etapa e registrada em `etapas` (vai para o ProcessingLog). Falha de uma
// etapa NAO derruba o arquivo: ele e marcado e segue para revisao humana.
import { detectarTipoArquivo, type TipoDocumentoDetectado } from './classificador.js';
import { interpretarTextoDanfe } from './danfe-texto.js';
import { OcrIndisponivelError, type MotorOcr } from './ocr.js';
import { pdfPadrao, type PdfPorta } from './pdf.js';
import { lerNfeXml, type ResultadoXml } from '../nfe/xml-parser.js';
import { XmlInvalidoError, type FonteDados, type NfeExtraida } from '../nfe/tipos.js';

/** Porta multimodal (etapa 5). Saida e SUGESTAO de baixa confianca, nunca validacao fiscal. */
export interface MotorMultimodal {
  interpretar(imagens: Buffer[], textoOcr: string): Promise<NfeExtraida | null>;
}

export interface DepsDocumentos {
  pdf: PdfPorta;
  ocr: MotorOcr | null;
  multimodal: MotorMultimodal | null;
}

export const depsDocumentosPadrao = (): DepsDocumentos => ({ pdf: pdfPadrao, ocr: null, multimodal: null });

export type EtapaNome = 'IDENTIFICACAO' | 'XML' | 'PDF_TEXTO' | 'PDF_RENDERIZACAO' | 'OCR' | 'MULTIMODAL' | 'NORMALIZACAO';
export interface EtapaResultado {
  etapa: EtapaNome;
  status: 'OK' | 'PULADA' | 'SEM_RESULTADO' | 'FALHA';
  detalhe?: string;
}

export interface ResultadoPipeline {
  tipoDetectado: TipoDocumentoDetectado;
  metodo: FonteDados | null;
  xml?: ResultadoXml;
  nfe?: NfeExtraida;
  texto?: string;
  confiancaOcr?: number;
  etapas: EtapaResultado[];
  /** erro terminal (ex.: XML invalido, arquivo desconhecido) */
  erro?: { codigo: string; mensagem: string };
}

const MIN_CARACTERES_TEXTO_NATIVO = 80;

export async function executarPipeline(bytes: Buffer, deps: DepsDocumentos): Promise<ResultadoPipeline> {
  const etapas: EtapaResultado[] = [];
  const tipo = detectarTipoArquivo(bytes);
  etapas.push({ etapa: 'IDENTIFICACAO', status: 'OK', detalhe: tipo });

  // ---------------------------------------------------------------- 1) XML
  if (tipo === 'XML') {
    try {
      const xml = lerNfeXml(bytes);
      etapas.push({ etapa: 'XML', status: 'OK', detalhe: xml.tipo });
      return { tipoDetectado: 'XML_NFE', metodo: xml.tipo === 'NFE' ? 'XML' : null, xml, nfe: xml.nfe, etapas };
    } catch (e: any) {
      const codigo = e instanceof XmlInvalidoError ? e.codigo : 'XML_ERRO';
      etapas.push({ etapa: 'XML', status: 'FALHA', detalhe: e.message });
      return { tipoDetectado: 'XML_NFE', metodo: null, etapas, erro: { codigo, mensagem: e.message } };
    }
  }
  etapas.push({ etapa: 'XML', status: 'PULADA', detalhe: 'arquivo nao e XML' });

  if (tipo === 'OUTRO') {
    return { tipoDetectado: 'OUTRO', metodo: null, etapas, erro: { codigo: 'TIPO_NAO_SUPORTADO', mensagem: 'Tipo de arquivo nao suportado (aceitos: XML, PDF, PNG, JPEG)' } };
  }

  let textoNativo = '';
  let imagens: Buffer[] = [];
  let tipoDetectado: TipoDocumentoDetectado = tipo === 'PDF' ? 'PDF_TEXTO' : 'IMAGEM';

  // ---------------------------------------------------------------- 2) texto nativo de PDF
  if (tipo === 'PDF') {
    try {
      const { paginas, totalPaginas } = await deps.pdf.extrairTexto(bytes);
      textoNativo = paginas.join('\n\f\n');
      const suficiente = textoNativo.replace(/\s/g, '').length >= MIN_CARACTERES_TEXTO_NATIVO;
      etapas.push({ etapa: 'PDF_TEXTO', status: suficiente ? 'OK' : 'SEM_RESULTADO', detalhe: `${totalPaginas} pagina(s), ${textoNativo.length} caractere(s)` });
      if (suficiente) {
        const nfe = interpretarTextoDanfe(textoNativo, 'PDF_TEXTO');
        etapas.push({ etapa: 'NORMALIZACAO', status: nfe.itens.length ? 'OK' : 'SEM_RESULTADO', detalhe: `${nfe.itens.length} item(ns)` });
        if (nfe.itens.length || nfe.chaveAcesso) {
          return { tipoDetectado: 'PDF_TEXTO', metodo: 'PDF_TEXTO', nfe, texto: textoNativo, etapas };
        }
      }
    } catch (e: any) {
      etapas.push({ etapa: 'PDF_TEXTO', status: 'FALHA', detalhe: e.message });
    }
    tipoDetectado = 'PDF_ESCANEADO';

    // ------------------------------------------------------------ 3) renderizacao
    try {
      imagens = await deps.pdf.renderizarPaginas(bytes);
      etapas.push({ etapa: 'PDF_RENDERIZACAO', status: imagens.length ? 'OK' : 'SEM_RESULTADO', detalhe: `${imagens.length} pagina(s) renderizada(s)` });
    } catch (e: any) {
      etapas.push({ etapa: 'PDF_RENDERIZACAO', status: 'FALHA', detalhe: e.message });
    }
  } else {
    imagens = [bytes];
    etapas.push({ etapa: 'PDF_TEXTO', status: 'PULADA', detalhe: 'arquivo e imagem' });
    etapas.push({ etapa: 'PDF_RENDERIZACAO', status: 'PULADA', detalhe: 'arquivo e imagem' });
  }

  // ---------------------------------------------------------------- 4) OCR
  let textoOcr = '';
  let confiancas: number[] = [];
  if (!imagens.length) {
    etapas.push({ etapa: 'OCR', status: 'PULADA', detalhe: 'sem imagens para reconhecer' });
  } else if (!deps.ocr) {
    etapas.push({ etapa: 'OCR', status: 'FALHA', detalhe: 'motor de OCR nao configurado (defina NFE_OCR_LANG_PATH com o idioma local)' });
  } else {
    try {
      const partes: string[] = [];
      for (const img of imagens) {
        const r = await deps.ocr.reconhecer(img);
        partes.push(r.texto);
        confiancas.push(r.confianca);
      }
      textoOcr = partes.join('\n\f\n');
      etapas.push({ etapa: 'OCR', status: textoOcr.trim() ? 'OK' : 'SEM_RESULTADO', detalhe: `${imagens.length} imagem(ns); confianca media ${(confiancas.reduce((a, b) => a + b, 0) / confiancas.length).toFixed(0)}` });
    } catch (e: any) {
      etapas.push({ etapa: 'OCR', status: 'FALHA', detalhe: e instanceof OcrIndisponivelError ? `OCR indisponivel: ${e.message}` : `erro no OCR: ${e.message}` });
    }
  }
  const confiancaOcr = confiancas.length ? confiancas.reduce((a, b) => a + b, 0) / confiancas.length : undefined;

  if (textoOcr.trim()) {
    const nfe = interpretarTextoDanfe(textoOcr, 'OCR');
    etapas.push({ etapa: 'NORMALIZACAO', status: nfe.itens.length ? 'OK' : 'SEM_RESULTADO', detalhe: `${nfe.itens.length} item(ns)` });
    if (nfe.itens.length || nfe.chaveAcesso) {
      return { tipoDetectado, metodo: 'OCR', nfe, texto: textoOcr, confiancaOcr, etapas };
    }
  }

  // ---------------------------------------------------------------- 5) multimodal (opcional)
  if (deps.multimodal && imagens.length) {
    try {
      const sugestao = await deps.multimodal.interpretar(imagens, textoOcr || textoNativo);
      etapas.push({ etapa: 'MULTIMODAL', status: sugestao ? 'OK' : 'SEM_RESULTADO' });
      if (sugestao && (sugestao.itens.length || sugestao.chaveAcesso)) {
        sugestao.fonte = 'MULTIMODAL';
        sugestao.avisos.push('Interpretacao multimodal e SUGESTAO; nao e validacao fiscal.');
        return { tipoDetectado, metodo: 'MULTIMODAL', nfe: sugestao, texto: textoOcr || textoNativo, confiancaOcr, etapas };
      }
    } catch (e: any) {
      etapas.push({ etapa: 'MULTIMODAL', status: 'FALHA', detalhe: e.message });
    }
  } else {
    etapas.push({ etapa: 'MULTIMODAL', status: 'PULADA', detalhe: deps.multimodal ? 'sem imagens' : 'desligado por padrao' });
  }

  return {
    tipoDetectado, metodo: null, texto: textoOcr || textoNativo || undefined, confiancaOcr, etapas,
    erro: { codigo: 'SEM_DADOS_EXTRAIDOS', mensagem: 'Nenhuma etapa conseguiu extrair dados da NF-e; encaminhado para revisao humana' },
  };
}
