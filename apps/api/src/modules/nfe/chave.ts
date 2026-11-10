// Chave de acesso da NF-e: 44 digitos
//  cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
// DV = modulo 11 (pesos 2..9 da direita para a esquerda).
// ATENCAO: validar estrutura + DV NAO e consulta a SEFAZ. A situacao real da
// nota (autorizada/cancelada/denegada) so se confirma no portal/web service.

export interface ChaveDecomposta {
  cUF: string;
  aamm: string;
  cnpj: string;
  modelo: string;
  serie: string;
  numero: string;
  tpEmis: string;
  codigoNumerico: string;
  dv: string;
}

export function soDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

export function calcularDvChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

export function decomporChave(chave: string): ChaveDecomposta | null {
  if (!/^\d{44}$/.test(chave)) return null;
  return {
    cUF: chave.slice(0, 2),
    aamm: chave.slice(2, 6),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: chave.slice(22, 25),
    numero: chave.slice(25, 34),
    tpEmis: chave.slice(34, 35),
    codigoNumerico: chave.slice(35, 43),
    dv: chave.slice(43, 44),
  };
}

export interface ResultadoChave {
  formatoValido: boolean;
  dvValido: boolean;
  /** problemas de coerencia com os demais campos do documento */
  incoerencias: string[];
  valida: boolean;
}

export interface DadosCoerencia {
  cnpjEmitente?: string | null;
  modelo?: string | null;
  serie?: string | null;
  numero?: string | null;
  cUF?: string | null;
}

export function validarChave(chave: string | null | undefined, dados: DadosCoerencia = {}): ResultadoChave {
  const limpa = soDigitos(chave);
  const parte = decomporChave(limpa);
  if (!parte) return { formatoValido: false, dvValido: false, incoerencias: ['chave deve ter 44 digitos'], valida: false };
  const dvValido = calcularDvChave(limpa.slice(0, 43)) === Number(parte.dv);
  const incoerencias: string[] = [];
  if (!dvValido) incoerencias.push('digito verificador (modulo 11) invalido');
  const cnpj = soDigitos(dados.cnpjEmitente);
  if (cnpj && cnpj.length === 14 && cnpj !== parte.cnpj) incoerencias.push('CNPJ do emitente difere do CNPJ embutido na chave');
  if (dados.modelo && dados.modelo.padStart(2, '0') !== parte.modelo) incoerencias.push('modelo difere do embutido na chave');
  if (dados.serie && dados.serie.padStart(3, '0') !== parte.serie) incoerencias.push('serie difere da embutida na chave');
  if (dados.numero && dados.numero.padStart(9, '0') !== parte.numero) incoerencias.push('numero difere do embutido na chave');
  if (dados.cUF && dados.cUF !== parte.cUF) incoerencias.push('cUF difere do embutido na chave');
  return { formatoValido: true, dvValido, incoerencias, valida: dvValido && incoerencias.length === 0 };
}

/** Validacao de CNPJ (DV). Usada para sinalizar emitente/destinatario mal lidos (OCR). */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}
