// Tipos compartilhados do pipeline NF-e. Valores monetarios em centavos (inteiros);
// quantidade e valor unitario preservados como TEXTO original (exatidao).

export type FonteDados = 'XML' | 'PDF_TEXTO' | 'OCR' | 'MULTIMODAL';

export interface NfeItemExtraido {
  numeroItem: number;
  codigoFornecedor: string | null;
  gtin: string | null;
  descricao: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origemMercadoria: string | null;
  cst: string | null;
  csosn: string | null;
  unidade: string | null;
  unidadeTributavel: string | null;
  quantidadeOriginal: string;
  valorUnitarioOriginal: string;
  valorTotalCentavos: number;
  freteCentavos: number;
  seguroCentavos: number;
  descontoCentavos: number;
  outrasCentavos: number;
  icmsCentavos: number;
  icmsStCentavos: number;
  ipiCentavos: number;
  pisCentavos: number;
  cofinsCentavos: number;
  /** nos de imposto originais (preservados para auditoria fiscal) */
  impostosOriginais: unknown;
  origemDados: FonteDados;
}

export interface DuplicataExtraida {
  numero: string | null;
  vencimento: string | null;
  valorCentavos: number | null;
}

export interface PagamentoExtraido {
  tipo: string | null;
  valorCentavos: number | null;
}

export interface NfeExtraida {
  chaveAcesso: string | null;
  cUF: string | null;
  modelo: string | null;
  serie: string | null;
  numero: string | null;
  naturezaOperacao: string | null;
  dataEmissao: string | null; // ISO como veio (dhEmi)
  emitente: {
    cnpj: string | null;
    cpf: string | null;
    nome: string | null;
    fantasia: string | null;
    ie: string | null;
    crt: string | null;
    uf: string | null;
  };
  destinatario: { cnpj: string | null; cpf: string | null; nome: string | null };
  totais: {
    produtosCentavos: number | null;
    freteCentavos: number | null;
    seguroCentavos: number | null;
    descontoCentavos: number | null;
    outrasCentavos: number | null;
    icmsCentavos: number | null;
    icmsStCentavos: number | null;
    ipiCentavos: number | null;
    pisCentavos: number | null;
    cofinsCentavos: number | null;
    notaCentavos: number | null;
  };
  pagamentos: PagamentoExtraido[];
  duplicatas: DuplicataExtraida[];
  protocolo: { numero: string | null; status: string | null } | null;
  itens: NfeItemExtraido[];
  fonte: FonteDados;
  /** campo -> de onde veio (XML:caminho, PDF_TEXTO:trecho, OCR:trecho) */
  origemCampos: Record<string, string>;
  /** avisos de leitura (campo ausente, valor ilegivel, etc.) */
  avisos: string[];
}

export type TipoXml = 'NFE' | 'RESUMO' | 'EVENTO' | 'OUTRO';

export class XmlInvalidoError extends Error {
  constructor(message: string, public readonly codigo: 'XML_MAL_FORMADO' | 'XML_PERIGOSO' | 'XML_NAO_NFE' | 'XML_SEM_ITENS' | 'XML_ESTRUTURA') {
    super(message);
    this.name = 'XmlInvalidoError';
  }
}
