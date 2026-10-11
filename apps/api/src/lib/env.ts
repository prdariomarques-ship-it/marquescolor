import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Carrega .env da raiz do monorepo (maxcolor/.env), sobrescrevendo process.env.
// Em scripts npm usamos dotenv-cli com --override, mas em ambientes que rodam
// o JS compilado diretamente (ex.: producao), este loader e o fallback.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// De src/lib/env.ts para raiz do monorepo: ../../..
// (src/lib -> src -> apps/api -> maxcolor)
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const envPath = path.join(monorepoRoot, '.env');
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath, override: true });
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variavel de ambiente ${name} nao definida no .env`);
  return value;
}

export const env = {
  PORT: parseInt(process.env.PORT || '3333', 10),
  DATABASE_URL: required('DATABASE_URL', process.env.DATABASE_URL),
  JWT_SECRET: required('JWT_SECRET', process.env.JWT_SECRET),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  LOJA_NOME: process.env.LOJA_NOME || 'Marquescollor Tintas',
  LOJA_CNPJ: process.env.LOJA_CNPJ || '',
  LOJA_ENDERECO: process.env.LOJA_ENDERECO || '',
  LOJA_CIDADE: process.env.LOJA_CIDADE || '',
  LOJA_UF: process.env.LOJA_UF || '',
  LOJA_TELEFONE: process.env.LOJA_TELEFONE || '',
  LOJA_WHATSAPP: process.env.LOJA_WHATSAPP || '',
} as const;
