// Rate limit em memoria para tentativas de login.
// Chave: ip + ":" + login. Limpa entradas > 15 min automaticamente.

interface Tentativa {
  count: number;
  primeiraEm: number;
}

const JANELA_MS = 15 * 60 * 1000; // 15 min
const LIMITE = 5;

const tentativas = new Map<string, Tentativa>();

export function chaveRateLimit(ip: string | undefined, login: string): string {
  return `${ip || 'desconhecido'}:${login.toLowerCase()}`;
}

export function incrementarTentativa(chave: string): { excedeu: boolean; tentativasRestantes: number } {
  const agora = Date.now();
  const t = tentativas.get(chave);

  if (!t || agora - t.primeiraEm > JANELA_MS) {
    // Nova janela
    tentativas.set(chave, { count: 1, primeiraEm: agora });
    return { excedeu: false, tentativasRestantes: LIMITE - 1 };
  }

  t.count += 1;
  const excedeu = t.count > LIMITE;
  const tentativasRestantes = Math.max(0, LIMITE - t.count);
  return { excedeu, tentativasRestantes };
}

export function resetarTentativas(chave: string): void {
  tentativas.delete(chave);
}

export function minutosRestantes(chave: string): number {
  const t = tentativas.get(chave);
  if (!t) return 0;
  const decorrido = Date.now() - t.primeiraEm;
  const restante = JANELA_MS - decorrido;
  return Math.max(0, Math.ceil(restante / 60000));
}
