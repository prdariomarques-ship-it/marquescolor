// Senhas com bcryptjs (pure JS, sem build nativa Windows)
import bcrypt from 'bcryptjs';

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
