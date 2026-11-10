// Runner de testes com banco ISOLADO.
// - Nunca le nem usa o .env da loja: gera DATABASE_URL/JWT_SECRET proprios.
// - Cria um SQLite novo e descartavel em apps/api/prisma/.test-db/ (gitignored).
// - Aplica o schema com `prisma db push` SOMENTE nesse arquivo.
// Uso: node scripts/run-tests.mjs [arquivos de teste...]  (sem args = lista padrao)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = path.join(apiDir, 'prisma', '.test-db');
mkdirSync(dbDir, { recursive: true });
// Limpa bancos de execucoes antigas (somente dentro de .test-db).
for (const f of readdirSync(dbDir)) {
  if (/^test-.*\.db(-journal)?$/.test(f)) rmSync(path.join(dbDir, f), { force: true });
}
const dbFile = path.join(dbDir, `test-${process.pid}-${Date.now()}.db`);
const dbUrl = `file:${dbFile.split(path.sep).join('/')}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: dbUrl,
  JWT_SECRET: randomBytes(48).toString('base64url'),
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  NFE_STORAGE_DIR: path.join(dbDir, `arquivos-${process.pid}`),
};
// OCR real (opcional): usa dados de idioma locais se existirem; os testes nunca baixam nada.
const ocrDir = path.join(apiDir, 'ocr-data');
if (!env.NFE_OCR_LANG_PATH && existsSync(path.join(ocrDir, 'por.traineddata'))) env.NFE_OCR_LANG_PATH = ocrDir;
console.log(`[tests] banco isolado: ${dbFile}`);
console.log(`[tests] OCR real: ${env.NFE_OCR_LANG_PATH ? 'habilitado (' + env.NFE_OCR_LANG_PATH + ')' : 'desabilitado (teste real fica skipped)'}`);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args) => spawnSync(cmd, args, { cwd: apiDir, env, stdio: 'inherit', shell: process.platform === 'win32' });

const push = run(npx, ['prisma', 'db', 'push', '--skip-generate']);
if (push.status !== 0) process.exit(push.status ?? 1);

const padrao = [
  'test/auth.test.ts', 'test/health.test.ts', 'test/produtos.test.ts',
  'test/features.test.ts', 'test/browser-services.test.ts',
  'test/nfe-xml.test.ts', 'test/nfe-fluxo.test.ts', 'test/nfe-documentos.test.ts',
  'test/nfe-email.test.ts', 'test/nfe-backup.test.ts',
];
const alvos = process.argv.length > 2 ? process.argv.slice(2) : padrao;
const t = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...alvos], { cwd: apiDir, env, stdio: 'inherit' });
process.exit(t.status ?? 1);
