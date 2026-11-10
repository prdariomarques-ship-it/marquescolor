// Fixtures SINTETICAS e anonimizadas (CNPJs ficticios com DV valido; nenhum
// documento fiscal real). Geram XML de NF-e 4.00 com chave de acesso valida.
import { calcularDvChave } from '../../src/modules/nfe/chave.js';

export const CNPJ_FORNECEDOR = '11222333000181'; // ficticio, DV valido
export const CNPJ_LOJA = '17758633000166'; // CNPJ da loja (publico no HANDOFF)
export const CNPJ_OUTRO_FORNECEDOR = '45997418000153'; // ficticio, DV valido

export interface ItemFixture {
  codigo?: string;
  descricao?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  gtin?: string;
  unidade?: string;
  quantidade?: string; // texto exato
  valorUnitario?: string; // texto exato
  valorTotal?: string; // se omitido, calculado
  csosn?: string;
  cst?: string;
  icms?: string;
  ipi?: string;
}

export interface NfeFixtureOpts {
  numero?: number;
  serie?: number;
  cnpjEmitente?: string;
  nomeEmitente?: string;
  cnpjDestinatario?: string;
  itens?: ItemFixture[];
  frete?: string;
  desconto?: string;
  valorNota?: string; // se omitido, calculado
  /** substitui o DV (para fabricar chave invalida) */
  dvForcado?: string;
  /** troca o DV por um valor errado (deterministico) */
  dvErrado?: boolean;
  semProtocolo?: boolean;
  dhEmi?: string;
  duplicatas?: { n: string; venc: string; v: string }[];
}

function pad(n: number | string, t: number) { return String(n).padStart(t, '0'); }

function somaDecimal2(vals: string[]): string {
  let c = 0n;
  for (const v of vals) {
    const [i, f = ''] = v.split('.');
    c += BigInt(i + (f + '00').slice(0, 2));
  }
  const s = c.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

function totalItem(q: string, vun: string): string {
  const [qi, qf = ''] = q.split('.');
  const [vi, vf = ''] = vun.split('.');
  const prod = BigInt(qi + qf) * BigInt(vi + vf);
  const escala = qf.length + vf.length;
  const divisor = 10n ** BigInt(escala - 2 > 0 ? escala - 2 : 0);
  let c = escala >= 2 ? prod / divisor + (prod % divisor * 2n >= divisor ? 1n : 0n) : prod * 10n ** BigInt(2 - escala);
  const s = c.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

export function montarChave(o: { cnpj: string; numero: number; serie: number; aamm?: string; dvForcado?: string; dvErrado?: boolean }): string {
  const base = `35${o.aamm ?? '2610'}${o.cnpj}55${pad(o.serie, 3)}${pad(o.numero, 9)}1${pad(o.numero * 7919 % 100000000, 8)}`;
  const dvCerto = calcularDvChave(base);
  const dv = o.dvForcado ?? String(o.dvErrado ? (dvCerto + 1) % 10 : dvCerto);
  return base + dv;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function montarXmlNfe(o: NfeFixtureOpts = {}): { xml: string; chave: string } {
  const numero = o.numero ?? 1001;
  const serie = o.serie ?? 1;
  const cnpj = o.cnpjEmitente ?? CNPJ_FORNECEDOR;
  const itens = o.itens ?? [{ codigo: '00012', descricao: 'TINTA ACRILICA FOSCO 18L BRANCO', ncm: '32091010', cfop: '5102', quantidade: '10.0000', valorUnitario: '12.5000000000', csosn: '102' }];
  const chave = montarChave({ cnpj, numero, serie, dvForcado: o.dvForcado, dvErrado: o.dvErrado });
  const dets = itens.map((it, i) => {
    const q = it.quantidade ?? '1.0000';
    const vun = it.valorUnitario ?? '10.0000000000';
    const vprod = it.valorTotal ?? totalItem(q, vun);
    const icmsTag = it.cst
      ? `<ICMS00><orig>0</orig><CST>${it.cst}</CST><modBC>3</modBC><vBC>${vprod}</vBC><pICMS>18.0000</pICMS><vICMS>${it.icms ?? '0.00'}</vICMS></ICMS00>`
      : `<ICMSSN102><orig>0</orig><CSOSN>${it.csosn ?? '102'}</CSOSN></ICMSSN102>`;
    return `<det nItem="${i + 1}"><prod><cProd>${esc(it.codigo ?? String(i + 1))}</cProd><cEAN>${it.gtin ?? 'SEM GTIN'}</cEAN><xProd>${esc(it.descricao ?? `PRODUTO ${i + 1}`)}</xProd><NCM>${it.ncm ?? '32091010'}</NCM>${it.cest ? `<CEST>${it.cest}</CEST>` : ''}<CFOP>${it.cfop ?? '5102'}</CFOP><uCom>${it.unidade ?? 'UN'}</uCom><qCom>${q}</qCom><vUnCom>${vun}</vUnCom><vProd>${vprod}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${it.unidade ?? 'UN'}</uTrib><qTrib>${q}</qTrib><vUnTrib>${vun}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS>${icmsTag}</ICMS><IPI><IPITrib><CST>50</CST><vIPI>${it.ipi ?? '0.00'}</vIPI></IPITrib></IPI><PIS><PISAliq><CST>01</CST><vPIS>0.00</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS></imposto></det>`;
  });
  const vProdutos = somaDecimal2(itens.map((it) => it.valorTotal ?? totalItem(it.quantidade ?? '1.0000', it.valorUnitario ?? '10.0000000000')));
  const frete = o.frete ?? '0.00';
  const desc = o.desconto ?? '0.00';
  const total = o.valorNota ?? (() => {
    const c = (v: string) => BigInt(v.replace('.', ''));
    const t = c(vProdutos) + c(frete) - c(desc);
    const s = t.toString().padStart(3, '0');
    return `${s.slice(0, -2)}.${s.slice(-2)}`;
  })();
  const dups = (o.duplicatas ?? []).map((d) => `<dup><nDup>${d.n}</nDup><dVenc>${d.venc}</dVenc><vDup>${d.v}</vDup></dup>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00"><ide><cUF>35</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>${serie}</serie><nNF>${numero}</nNF><dhEmi>${o.dhEmi ?? '2026-10-20T10:00:00-03:00'}</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${cnpj}</CNPJ><xNome>${esc(o.nomeEmitente ?? 'DISTRIBUIDORA FICTICIA DE TINTAS LTDA')}</xNome><xFant>DIST FICTICIA</xFant><enderEmit><UF>SP</UF></enderEmit><IE>111111111111</IE><CRT>1</CRT></emit><dest><CNPJ>${o.cnpjDestinatario ?? CNPJ_LOJA}</CNPJ><xNome>MARQUESCOLLOR TINTAS (TESTE)</xNome></dest>${dets.join('')}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${vProdutos}</vProd><vFrete>${frete}</vFrete><vSeg>0.00</vSeg><vDesc>${desc}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${total}</vNF></ICMSTot></total><transp><modFrete>0</modFrete></transp>${dups ? `<cobr>${dups}</cobr>` : ''}<pag><detPag><tPag>15</tPag><vPag>${total}</vPag></detPag></pag></infNFe></NFe>${o.semProtocolo ? '' : `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-10-20T10:01:00-03:00</dhRecbto><nProt>135260000000001</nProt><digVal>x</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`}</nfeProc>`;
  return { xml, chave };
}

/** XML de evento de cancelamento (110111) para a chave informada. */
export function montarXmlEventoCancelamento(chave: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento Id="ID1101113520"><cOrgao>35</cOrgao><tpAmb>2</tpAmb><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><chNFe>${chave}</chNFe><dhEvento>2026-10-21T10:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento></detEvento></infEvento></evento></procEventoNFe>`;
}
