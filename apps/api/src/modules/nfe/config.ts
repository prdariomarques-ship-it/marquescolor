// Parametros do modulo (todos ajustaveis por variavel de ambiente; nenhum segredo aqui).
// Valores de tolerancia/limites sao PARAMETROS DE NEGOCIO a validar com o contador
// (ver docs/integrations/nfe-ingestion.md, secao "Parametros pendentes").
import path from 'node:path';

function num(nome: string, padrao: number): number {
  const v = process.env[nome];
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

export function nfeConfig() {
  return {
    /** diferenca maxima aceita (centavos) entre vProd e qCom x vUnCom, e entre totais somados e informados */
    toleranciaCentavos: num('NFE_TOLERANCIA_CENTAVOS', 1),
    /** variacao percentual de custo unitario (vs custo atual do produto) acima da qual gera alerta */
    limiteVariacaoCustoPct: num('NFE_LIMITE_VARIACAO_CUSTO_PCT', 10),
    /** diretorio dos arquivos originais (XML/PDF/imagem). Fora do banco; incluir no backup. */
    storageDir: path.resolve(process.env.NFE_STORAGE_DIR || path.join(process.cwd(), 'nfe-storage')),
    /** CNPJ da loja para conferir o destinatario */
    cnpjLoja: (process.env.LOJA_CNPJ || '').replace(/\D/g, ''),
  };
}
