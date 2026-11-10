// Interpretacao do TEXTO de um DANFE (vindo de PDF nativo ou de OCR) -> NfeExtraida.
// Etapa 6 (normalizacao) do pipeline hibrido. E leitura APROXIMADA e dependente de
// layout: nunca substitui o XML e SEMPRE gera revisao humana (FONTE_NAO_XML).
// A chave de acesso (44 digitos com DV) e o campo mais confiavel: dela derivamos
// CNPJ emitente, modelo, serie e numero e comparamos com o que o OCR leu.
import { cnpjValido, decomporChave, soDigitos, validarChave } from '../nfe/chave.js';
import { decimalParaCentavos, parseDecimal } from '../nfe/decimal.js';
import type { FonteDados, NfeExtraida, NfeItemExtraido } from '../nfe/tipos.js';

const CSOSN = new Set(['101', '102', '103', '201', '202', '203', '300', '400', '500', '900']);

/** "1.234,56" -> "1234.56"; null se nao for numero no formato brasileiro. */
export function numeroBr(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return null;
  const r = t.replace(/\./g, '').replace(',', '.');
  return parseDecimal(r) ? r : null;
}

const RE_CHAVE = /(?:\d{4}[\s.]?){10}\d{4}/g;
const RE_CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const RE_ITEM = /^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{3,4})\s+(\d{4})\s+([A-Za-z]{1,4})\s+(\d[\d.]*,\d{2,4})\s+(\d[\d.]*,\d{2,10})\s+(\d[\d.]*,\d{2})(?:\s|$)/;

function achar(texto: string, re: RegExp): string | null {
  const m = re.exec(texto);
  return m ? (m[1] ?? m[0]).trim() : null;
}

export function interpretarTextoDanfe(texto: string, fonte: Exclude<FonteDados, 'XML'>): NfeExtraida {
  const avisos: string[] = ['Leitura aproximada de texto (nao e XML): conferir todos os campos contra o documento original.'];
  const origem: Record<string, string> = {};
  const marca = (campo: string, trecho: string) => { origem[campo] = `${fonte}:${trecho.slice(0, 80)}`; };
  const plano = texto.replace(/\r/g, '');

  // ---- chave de acesso
  let chave: string | null = null;
  const candidatas = [...plano.replace(/[ \t]+/g, ' ').matchAll(RE_CHAVE)].map((m) => soDigitos(m[0])).filter((c) => c.length === 44);
  const validas = candidatas.filter((c) => validarChave(c).dvValido);
  chave = validas[0] ?? candidatas[0] ?? null;
  if (chave) {
    marca('chaveAcesso', chave);
    if (!validarChave(chave).dvValido) avisos.push('Chave de acesso lida com digito verificador invalido (provavel erro de leitura).');
  } else {
    avisos.push('Chave de acesso (44 digitos) nao encontrada.');
  }
  const dc = chave ? decomporChave(chave) : null;

  // ---- emitente
  const cnpjs = [...plano.matchAll(RE_CNPJ)].map((m) => soDigitos(m[0]));
  let emitCnpj = cnpjs[0] ?? null;
  if (dc) {
    if (emitCnpj && emitCnpj !== dc.cnpj) avisos.push(`CNPJ lido no texto (${emitCnpj}) difere do CNPJ da chave (${dc.cnpj}); usado o da chave.`);
    if (!emitCnpj || emitCnpj !== dc.cnpj) emitCnpj = dc.cnpj;
    marca('emitente.cnpj', `chave:${dc.cnpj}`);
  } else if (emitCnpj) {
    marca('emitente.cnpj', emitCnpj);
    if (!cnpjValido(emitCnpj)) avisos.push('CNPJ do emitente com digito verificador invalido.');
  }
  const destCnpj = cnpjs.find((c) => c !== emitCnpj) ?? null;
  const nomeEmit = achar(plano, /RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
  if (nomeEmit) marca('emitente.nome', nomeEmit);

  // ---- numero/serie/modelo (da chave, nao do texto)
  const numero = dc ? String(parseInt(dc.numero, 10)) : achar(plano, /N[º°o]?\.?\s*0*(\d{1,9})/i);
  const serie = dc ? String(parseInt(dc.serie, 10)) : achar(plano, /S[ÉE]RIE\s*:?\s*0*(\d{1,3})/i);
  if (dc) { marca('numero', 'chave'); marca('serie', 'chave'); }

  // ---- data
  const dataBr = achar(plano, /EMISS[ÃA]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i) ?? achar(plano, /(\d{2}\/\d{2}\/\d{4})/);
  let dataEmissao: string | null = null;
  if (dataBr) {
    const [d, m, a] = dataBr.split('/');
    dataEmissao = `${a}-${m}-${d}T00:00:00-03:00`;
    marca('dataEmissao', dataBr);
  }

  // ---- totais
  const vNF = numeroBr(achar(plano, /VALOR TOTAL DA NOTA\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i));
  const vProd = numeroBr(achar(plano, /VALOR TOTAL DOS PRODUTOS\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i));
  const vFrete = numeroBr(achar(plano, /VALOR DO FRETE\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i));
  const vDesc = numeroBr(achar(plano, /DESCONTO\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i));
  if (vNF) marca('totais.nota', 'VALOR TOTAL DA NOTA');
  if (vProd) marca('totais.produtos', 'VALOR TOTAL DOS PRODUTOS');

  // ---- itens
  const itens: NfeItemExtraido[] = [];
  let n = 0;
  for (const linha of plano.split('\n')) {
    const m = RE_ITEM.exec(linha.trim());
    if (!m) continue;
    const quantidade = numeroBr(m[7]);
    const unitario = numeroBr(m[8]);
    const total = numeroBr(m[9]);
    if (!quantidade || !unitario || !total) continue;
    n += 1;
    const cod3 = m[4];
    const ehCsosn = cod3.length === 3 && CSOSN.has(cod3);
    if (cod3.length === 3 && ['300', '400', '500', '900'].includes(cod3)) avisos.push(`item ${n}: codigo ${cod3} ambiguo (CSOSN ou origem+CST); tratado como CSOSN.`);
    itens.push({
      numeroItem: n, codigoFornecedor: m[1], gtin: null, descricao: m[2].trim(), ncm: m[3], cest: null, cfop: m[5],
      origemMercadoria: !ehCsosn && cod3.length === 3 ? cod3[0] : null,
      cst: !ehCsosn && cod3.length === 3 ? cod3.slice(1) : cod3.length === 2 ? cod3 : null,
      csosn: ehCsosn ? cod3 : null,
      unidade: m[6].toUpperCase(), unidadeTributavel: null,
      quantidadeOriginal: quantidade, valorUnitarioOriginal: unitario, valorTotalCentavos: decimalParaCentavos(total) ?? 0,
      freteCentavos: 0, seguroCentavos: 0, descontoCentavos: 0, outrasCentavos: 0,
      icmsCentavos: 0, icmsStCentavos: 0, ipiCentavos: 0, pisCentavos: 0, cofinsCentavos: 0,
      impostosOriginais: { linhaOriginal: linha.trim() },
      origemDados: fonte,
    });
  }
  if (itens.length) { marca('itens', `${itens.length} linha(s) de tabela`); avisos.push('Impostos por item nao sao lidos de PDF/OCR (ficam zerados); GTIN/CEST tambem nao.'); }
  else avisos.push('Nenhum item reconhecido na tabela de produtos.');

  return {
    chaveAcesso: chave,
    cUF: dc?.cUF ?? null,
    modelo: dc?.modelo ?? null,
    serie,
    numero,
    naturezaOperacao: null,
    dataEmissao,
    emitente: { cnpj: emitCnpj, cpf: null, nome: nomeEmit, fantasia: null, ie: null, crt: null, uf: null },
    destinatario: { cnpj: destCnpj, cpf: null, nome: null },
    totais: {
      produtosCentavos: decimalParaCentavos(vProd), freteCentavos: decimalParaCentavos(vFrete), seguroCentavos: null,
      descontoCentavos: decimalParaCentavos(vDesc), outrasCentavos: null, icmsCentavos: null, icmsStCentavos: null,
      ipiCentavos: null, pisCentavos: null, cofinsCentavos: null, notaCentavos: decimalParaCentavos(vNF),
    },
    pagamentos: [], duplicatas: [], protocolo: null,
    itens, fonte, origemCampos: origem, avisos,
  };
}
