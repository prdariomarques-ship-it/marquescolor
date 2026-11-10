// Leitor de XML de NF-e (leiaute 4.00) sobre fast-xml-parser.
//
// Configuracao OBRIGATORIA (valores nao devem ser coagidos a numero):
//  - parseTagValue/parseAttributeValue = false  => chave de 44 digitos, CNPJ e cProd
//    nunca viram float nem perdem zeros a esquerda;
//  - removeNSPrefix, ignoreAttributes=false (precisamos de Id e nItem);
//  - isArray para det/detPag/dup/vol (um unico elemento continua sendo lista);
//  - processEntities = false + rejeicao previa de <!DOCTYPE / <!ENTITY (sem XXE,
//    sem "billion laughs"). As 5 entidades predefinidas sao decodificadas aqui.
//
// LIMITES CONHECIDOS (nao e validacao fiscal): nao valida assinatura digital, nao
// consulta SEFAZ, nao confere o schema XSD. O XML e a fonte prioritaria dos dados,
// mas "XML bem formado" != "nota autorizada".
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decimalParaCentavos, parseDecimal } from './decimal.js';
import { soDigitos } from './chave.js';
import {
  XmlInvalidoError,
  type DuplicataExtraida,
  type NfeExtraida,
  type NfeItemExtraido,
  type PagamentoExtraido,
  type TipoXml,
} from './tipos.js';

const TAMANHO_MAXIMO_XML = 5 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: true,
  processEntities: false,
  isArray: (nome) => ['det', 'detPag', 'dup', 'vol', 'NFref'].includes(nome),
});

type No = Record<string, any>;

function decodificarEntidades(v: string): string {
  return v
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function txt(no: unknown): string | null {
  if (no === undefined || no === null) return null;
  if (typeof no === 'object') return null;
  const s = decodificarEntidades(String(no)).trim();
  return s === '' ? null : s;
}

function filho(no: unknown, nome: string): No | undefined {
  if (!no || typeof no !== 'object') return undefined;
  const v = (no as No)[nome];
  return v && typeof v === 'object' ? (v as No) : undefined;
}

function primeiroFilhoObjeto(no: No | undefined): { nome: string; valor: No } | undefined {
  if (!no) return undefined;
  for (const [k, v] of Object.entries(no)) {
    if (!k.startsWith('@_') && v && typeof v === 'object') return { nome: k, valor: v as No };
  }
  return undefined;
}

function cent(v: unknown): number | null {
  return decimalParaCentavos(txt(v));
}

export function detectarTipoXml(raiz: string): TipoXml {
  if (raiz === 'nfeProc' || raiz === 'NFe') return 'NFE';
  if (raiz === 'resNFe') return 'RESUMO';
  if (raiz === 'procEventoNFe' || raiz === 'evento' || raiz === 'retEvento') return 'EVENTO';
  return 'OUTRO';
}

function parseBruto(bytes: Buffer): No {
  if (bytes.length === 0) throw new XmlInvalidoError('arquivo XML vazio', 'XML_MAL_FORMADO');
  if (bytes.length > TAMANHO_MAXIMO_XML) throw new XmlInvalidoError('XML excede o tamanho maximo permitido', 'XML_PERIGOSO');
  // decodifica: BOM UTF-8 removido; NF-e e UTF-8 por norma (declaracao ISO-8859-1 e tolerada via latin1).
  let texto = bytes.toString('utf8');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  if (texto.includes('�') && /encoding=["']iso-8859-1["']/i.test(texto.slice(0, 200))) texto = bytes.toString('latin1');
  if (/<!DOCTYPE/i.test(texto) || /<!ENTITY/i.test(texto)) {
    throw new XmlInvalidoError('XML com DOCTYPE/ENTITY rejeitado por seguranca', 'XML_PERIGOSO');
  }
  const valid = XMLValidator.validate(texto);
  if (valid !== true) {
    throw new XmlInvalidoError(`XML mal formado: ${valid.err.msg}`, 'XML_MAL_FORMADO');
  }
  return parser.parse(texto) as No;
}

export interface ResultadoXml {
  tipo: TipoXml;
  nfe?: NfeExtraida;
  /** para RESUMO/EVENTO: dados minimos */
  chave?: string | null;
  evento?: { tipoEvento: string | null; descricao: string | null };
}

function extrairImpostoItem(imposto: No | undefined) {
  const icmsGrupo = primeiroFilhoObjeto(filho(imposto, 'ICMS'));
  const icms = icmsGrupo?.valor;
  const ipiTrib = filho(filho(imposto, 'IPI'), 'IPITrib');
  const pis = primeiroFilhoObjeto(filho(imposto, 'PIS'))?.valor;
  const cofins = primeiroFilhoObjeto(filho(imposto, 'COFINS'))?.valor;
  return {
    origem: txt(icms?.orig),
    cst: txt(icms?.CST),
    csosn: txt(icms?.CSOSN),
    icms: cent(icms?.vICMS) ?? 0,
    icmsSt: cent(icms?.vICMSST) ?? 0,
    ipi: cent(ipiTrib?.vIPI) ?? 0,
    pis: cent(pis?.vPIS) ?? 0,
    cofins: cent(cofins?.vCOFINS) ?? 0,
    original: imposto ?? null,
  };
}

function gtinValido(v: string | null): string | null {
  if (!v) return null;
  if (/^SEM GTIN$/i.test(v)) return null;
  return /^\d{8}$|^\d{12,14}$/.test(v) ? v : null;
}

export function lerNfeXml(bytes: Buffer): ResultadoXml {
  const doc = parseBruto(bytes);
  const raiz = Object.keys(doc).find((k) => !k.startsWith('?') && !k.startsWith('@_'));
  if (!raiz) throw new XmlInvalidoError('XML sem elemento raiz', 'XML_MAL_FORMADO');
  const tipo = detectarTipoXml(raiz);

  if (tipo === 'RESUMO') {
    const r = doc[raiz] as No;
    return { tipo, chave: txt(r.chNFe) };
  }
  if (tipo === 'EVENTO') {
    const r = doc[raiz] as No;
    const inf = filho(filho(r, 'evento'), 'infEvento') ?? filho(r, 'infEvento');
    return { tipo, chave: txt(inf?.chNFe), evento: { tipoEvento: txt(inf?.tpEvento), descricao: txt(inf?.detEvento && typeof inf.detEvento === 'object' ? (inf.detEvento as No).descEvento : null) ?? txt(inf?.descEvento) } };
  }
  if (tipo === 'OUTRO') {
    throw new XmlInvalidoError(`elemento raiz <${raiz}> nao e uma NF-e`, 'XML_NAO_NFE');
  }

  const nfeNo = raiz === 'nfeProc' ? filho(doc[raiz], 'NFe') : (doc[raiz] as No);
  const inf = filho(nfeNo, 'infNFe');
  if (!inf) throw new XmlInvalidoError('infNFe ausente', 'XML_ESTRUTURA');
  const dets = (inf.det ?? []) as No[];
  if (!Array.isArray(dets) || dets.length === 0) throw new XmlInvalidoError('NF-e sem itens (det/prod)', 'XML_SEM_ITENS');

  const avisos: string[] = [];
  const origem: Record<string, string> = {};
  const marca = (campo: string, caminho: string) => { origem[campo] = `XML:${caminho}`; };

  const idAttr = String(inf['@_Id'] ?? '');
  const mChave = /^NFe(\d{44})$/.exec(idAttr);
  const chaveAcesso = mChave ? mChave[1] : null;
  if (!chaveAcesso) avisos.push('Id de infNFe ausente ou fora do formato NFe+44 digitos');
  else marca('chaveAcesso', 'infNFe/@Id');

  const ide = filho(inf, 'ide');
  const emit = filho(inf, 'emit');
  const dest = filho(inf, 'dest');
  const icmsTot = filho(filho(inf, 'total'), 'ICMSTot');

  const itens: NfeItemExtraido[] = [];
  for (const det of dets) {
    const prod = filho(det, 'prod');
    const n = parseInt(String(det['@_nItem'] ?? ''), 10);
    if (!prod || !Number.isFinite(n)) {
      avisos.push('det sem prod ou sem nItem foi ignorado');
      continue;
    }
    const q = txt(prod.qCom);
    const vUn = txt(prod.vUnCom);
    const vProd = cent(prod.vProd);
    if (!q || !parseDecimal(q) || !vUn || !parseDecimal(vUn) || vProd === null) {
      throw new XmlInvalidoError(`item ${n}: qCom/vUnCom/vProd ausentes ou nao numericos`, 'XML_ESTRUTURA');
    }
    const imp = extrairImpostoItem(filho(det, 'imposto'));
    itens.push({
      numeroItem: n,
      codigoFornecedor: txt(prod.cProd),
      gtin: gtinValido(txt(prod.cEAN)),
      descricao: txt(prod.xProd),
      ncm: txt(prod.NCM),
      cest: txt(prod.CEST),
      cfop: txt(prod.CFOP),
      origemMercadoria: imp.origem,
      cst: imp.cst,
      csosn: imp.csosn,
      unidade: txt(prod.uCom),
      unidadeTributavel: txt(prod.uTrib),
      quantidadeOriginal: q,
      valorUnitarioOriginal: vUn,
      valorTotalCentavos: vProd,
      freteCentavos: cent(prod.vFrete) ?? 0,
      seguroCentavos: cent(prod.vSeg) ?? 0,
      descontoCentavos: cent(prod.vDesc) ?? 0,
      outrasCentavos: cent(prod.vOutro) ?? 0,
      icmsCentavos: imp.icms,
      icmsStCentavos: imp.icmsSt,
      ipiCentavos: imp.ipi,
      pisCentavos: imp.pis,
      cofinsCentavos: imp.cofins,
      impostosOriginais: imp.original,
      origemDados: 'XML',
    });
  }
  if (itens.length === 0) throw new XmlInvalidoError('NF-e sem itens validos', 'XML_SEM_ITENS');
  const numeros = new Set(itens.map((i) => i.numeroItem));
  if (numeros.size !== itens.length) throw new XmlInvalidoError('itens com nItem duplicado', 'XML_ESTRUTURA');
  marca('itens', 'infNFe/det');

  const pagamentos: PagamentoExtraido[] = [];
  const detPag = filho(inf, 'pag')?.detPag as No[] | undefined;
  for (const p of detPag ?? []) pagamentos.push({ tipo: txt(p.tPag), valorCentavos: cent(p.vPag) });

  const duplicatas: DuplicataExtraida[] = [];
  const dups = filho(inf, 'cobr')?.dup as No[] | undefined;
  for (const d of dups ?? []) duplicatas.push({ numero: txt(d.nDup), vencimento: txt(d.dVenc), valorCentavos: cent(d.vDup) });

  let protocolo: NfeExtraida['protocolo'] = null;
  if (raiz === 'nfeProc') {
    const infProt = filho(filho(doc[raiz], 'protNFe'), 'infProt');
    if (infProt) protocolo = { numero: txt(infProt.nProt), status: txt(infProt.cStat) };
  }

  const nfe: NfeExtraida = {
    chaveAcesso,
    cUF: txt(ide?.cUF),
    modelo: txt(ide?.mod),
    serie: txt(ide?.serie),
    numero: txt(ide?.nNF),
    naturezaOperacao: txt(ide?.natOp),
    dataEmissao: txt(ide?.dhEmi) ?? txt(ide?.dEmi),
    emitente: {
      cnpj: txt(emit?.CNPJ),
      cpf: txt(emit?.CPF),
      nome: txt(emit?.xNome),
      fantasia: txt(emit?.xFant),
      ie: txt(emit?.IE),
      crt: txt(emit?.CRT),
      uf: txt(filho(emit, 'enderEmit')?.UF),
    },
    destinatario: { cnpj: txt(dest?.CNPJ), cpf: txt(dest?.CPF), nome: txt(dest?.xNome) },
    totais: {
      produtosCentavos: cent(icmsTot?.vProd),
      freteCentavos: cent(icmsTot?.vFrete),
      seguroCentavos: cent(icmsTot?.vSeg),
      descontoCentavos: cent(icmsTot?.vDesc),
      outrasCentavos: cent(icmsTot?.vOutro),
      icmsCentavos: cent(icmsTot?.vICMS),
      icmsStCentavos: cent(icmsTot?.vST),
      ipiCentavos: cent(icmsTot?.vIPI),
      pisCentavos: cent(icmsTot?.vPIS),
      cofinsCentavos: cent(icmsTot?.vCOFINS),
      notaCentavos: cent(icmsTot?.vNF),
    },
    pagamentos,
    duplicatas,
    protocolo,
    itens,
    fonte: 'XML',
    origemCampos: origem,
    avisos,
  };
  if (!icmsTot) avisos.push('total/ICMSTot ausente: totais da nota nao puderam ser lidos');
  else marca('totais', 'infNFe/total/ICMSTot');
  if (!nfe.emitente.cnpj && !nfe.emitente.cpf) avisos.push('emitente sem CNPJ/CPF');
  else marca('emitente', 'infNFe/emit');
  if (nfe.emitente.cnpj) nfe.emitente.cnpj = soDigitos(nfe.emitente.cnpj);
  if (nfe.destinatario.cnpj) nfe.destinatario.cnpj = soDigitos(nfe.destinatario.cnpj);
  return { tipo: 'NFE', nfe, chave: chaveAcesso };
}
