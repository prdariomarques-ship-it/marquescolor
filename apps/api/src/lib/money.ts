// Moeda: valores sempre em centavos (inteiros). Nunca usar float para dinheiro.

export function centavosParaReal(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const reaisStr = reais.toLocaleString('pt-BR');
  const centsStr = cents.toString().padStart(2, '0');
  const out = `${reaisStr},${centsStr}`;
  return negativo ? `-${out}` : out;
}

export function realParaCentavos(real: string): number {
  if (!real) return 0;
  const limpo = real.replace(/\s/g, '').replace(/[R$\u00a0]/g, '');
  if (!limpo) return 0;
  let normalizado: string;
  if (limpo.includes(',')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else {
    normalizado = limpo;
  }
  const n = parseFloat(normalizado);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function multiplicarCentavos(centavos: number, fator: number): number {
  return Math.round(centavos * fator);
}

export function calcularTroco(recebidoCentavos: number, totalCentavos: number): number {
  return Math.max(0, recebidoCentavos - totalCentavos);
}
