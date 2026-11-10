// Aritmetica decimal EXATA para valores de NF-e (sem parseFloat).
// vUnCom pode ter ate 10 casas decimais e qCom ate 4 (leiaute 4.00); vProd e
// os totais tem 2. Tudo e tratado como texto -> BigInt escalado.

const RE_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

export interface DecimalExato {
  negativo: boolean;
  /** inteiro escalado: valor = unscaled / 10^escala */
  unscaled: bigint;
  escala: number;
}

/** Aceita "12", "12.50", "-3.1415". Retorna null se nao for decimal valido (ex.: "1,5", "abc", ""). */
export function parseDecimal(texto: string | null | undefined): DecimalExato | null {
  if (texto === null || texto === undefined) return null;
  const m = RE_DECIMAL.exec(texto.trim());
  if (!m) return null;
  const frac = m[3] ?? '';
  const unscaled = BigInt(m[2] + frac);
  return { negativo: m[1] === '-', unscaled: m[1] === '-' ? -unscaled : unscaled, escala: frac.length };
}

const POW10 = (n: number): bigint => 10n ** BigInt(n);

/** Arredonda (half-up, afastando de zero) um valor escalado para `casas` casas. */
export function arredondarEscalado(unscaled: bigint, escala: number, casas: number): bigint {
  if (escala <= casas) return unscaled * POW10(casas - escala);
  const divisor = POW10(escala - casas);
  const neg = unscaled < 0n;
  const abs = neg ? -unscaled : unscaled;
  let q = abs / divisor;
  const resto = abs % divisor;
  if (resto * 2n >= divisor) q += 1n;
  return neg ? -q : q;
}

/** "12.345" -> 1235 centavos (half-up). null se invalido. */
export function decimalParaCentavos(texto: string | null | undefined): number | null {
  const d = parseDecimal(texto);
  if (!d) return null;
  const c = arredondarEscalado(d.unscaled, d.escala, 2);
  return Number(c);
}

/** Produto exato a*b arredondado para centavos. null se algum operando for invalido. */
export function multiplicarParaCentavos(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (!x || !y) return null;
  return Number(arredondarEscalado(x.unscaled * y.unscaled, x.escala + y.escala, 2));
}

/** Conversao para number (apenas para campos Float como quantidade; NUNCA para dinheiro). */
export function decimalParaNumero(texto: string | null | undefined): number | null {
  const d = parseDecimal(texto);
  if (!d) return null;
  return Number(d.unscaled) / Number(POW10(d.escala));
}

/** Formata centavos como "1234.56" (texto exato). */
export function centavosParaDecimalTexto(c: number): string {
  const neg = c < 0;
  const abs = Math.abs(Math.round(c));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}
