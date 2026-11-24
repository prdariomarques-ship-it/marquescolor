// Armazenamento dos arquivos ORIGINAIS (XML/PDF/imagem). Ficam fora do banco, em
// diretorio configuravel (NFE_STORAGE_DIR), enderecados por SHA-256. O arquivo
// original nunca e alterado nem sobrescrito. Incluir esse diretorio no backup.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { nfeConfig } from '../nfe/config.js';

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function extensaoSegura(nome: string): string {
  const e = path.extname(nome).toLowerCase().replace('.', '');
  return /^[a-z0-9]{1,5}$/.test(e) ? e : 'bin';
}

export async function salvarOriginal(bytes: Buffer, nomeOriginal: string): Promise<{ sha256: string; caminho: string }> {
  const hash = sha256(bytes);
  const relativo = path.posix.join(hash.slice(0, 2), `${hash}.${extensaoSegura(nomeOriginal)}`);
  const completo = path.join(nfeConfig().storageDir, ...relativo.split('/'));
  await mkdir(path.dirname(completo), { recursive: true });
  try {
    await access(completo); // ja existe (mesmo hash): nao regrava
  } catch {
    await writeFile(completo, bytes, { flag: 'wx' });
  }
  return { sha256: hash, caminho: relativo };
}

export async function lerOriginal(caminhoRelativo: string): Promise<Buffer> {
  const base = nfeConfig().storageDir;
  const completo = path.resolve(base, ...caminhoRelativo.split('/'));
  if (!completo.startsWith(path.resolve(base) + path.sep)) throw new Error('caminho fora do armazenamento');
  return readFile(completo);
}
