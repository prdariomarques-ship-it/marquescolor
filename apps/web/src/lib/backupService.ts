export type BackupSettings = {
  enabled: boolean;
  intervalMinutes: 5 | 15 | 30 | 60;
  automaticDownload: boolean;
};

export type LocalBackupInfo = {
  id: string;
  createdAt: string;
  compressedSize: number;
  uncompressedSize: number;
  compression: 'gzip' | 'json';
  blob?: Blob;
};

const SETTINGS_KEY = 'marquescolor_backup_settings_v1';
const DB_NAME = 'marquescolor-local-backups';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

export function carregarConfiguracaoBackup(): BackupSettings {
  try {
    const value = localStorage.getItem(SETTINGS_KEY);
    if (!value) return { enabled: false, intervalMinutes: 15, automaticDownload: false };
    const parsed = JSON.parse(value);
    const interval = [5, 15, 30, 60].includes(Number(parsed.intervalMinutes)) ? Number(parsed.intervalMinutes) : 15;
    return {
      enabled: Boolean(parsed.enabled),
      intervalMinutes: interval as BackupSettings['intervalMinutes'],
      automaticDownload: Boolean(parsed.automaticDownload),
    };
  } catch {
    return { enabled: false, intervalMinutes: 15, automaticDownload: false };
  }
}

export function salvarConfiguracaoBackup(settings: BackupSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('marquescolor-backup-settings'));
}

async function sha256(texto: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador não oferece SHA-256 para validar o backup.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function criarBackupComprimido(dados: any): Promise<{
  blob: Blob;
  filename: string;
  compression: 'gzip' | 'json';
  uncompressedSize: number;
  compressedSize: number;
}> {
  const data = dados?.data || dados;
  const checksum = await sha256(JSON.stringify(data));
  const payload = {
    ...dados,
    checksumAlgo: 'SHA-256',
    checksum,
    backupClientAt: new Date().toISOString(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const uncompressedSize = bytes.byteLength;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if ('CompressionStream' in globalThis) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    return {
      blob,
      filename: `marquescolor-${timestamp}.mcbackup.json.gz`,
      compression: 'gzip',
      uncompressedSize,
      compressedSize: blob.size,
    };
  }

  const blob = new Blob([bytes], { type: 'application/json;charset=utf-8' });
  return {
    blob,
    filename: `marquescolor-${timestamp}.mcbackup.json`,
    compression: 'json',
    uncompressedSize,
    compressedSize: blob.size,
  };
}

export async function lerEValidarBackup(file: File | Blob, filename = ''): Promise<any> {
  let texto: string;
  const comprimido = filename.toLowerCase().endsWith('.gz');
  if (comprimido) {
    if (!('DecompressionStream' in globalThis)) throw new Error('Este navegador não consegue abrir arquivos GZIP. Use Chrome ou Edge atualizado.');
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    texto = await new Response(stream).text();
  } else {
    texto = await file.text();
  }
  let payload: any;
  try { payload = JSON.parse(texto); }
  catch { throw new Error('O arquivo não contém um JSON de backup válido.'); }

  if (payload?.format && payload.format !== 'MARQUESCOLOR_BACKUP') {
    throw new Error('O formato deste arquivo não pertence ao MarquesColor.');
  }
  if (payload?.format === 'MARQUESCOLOR_BACKUP' && payload.version !== 1) {
    throw new Error('A versão deste backup não é compatível com esta aplicação.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Estrutura de backup inválida.');
  }
  if (payload?.checksumAlgo || payload?.checksum) {
    if (payload.checksumAlgo !== 'SHA-256' || typeof payload.checksum !== 'string') {
      throw new Error('Metadados de integridade do backup inválidos.');
    }
    const actual = await sha256(JSON.stringify(payload.data || payload));
    if (actual !== payload.checksum) throw new Error('A validação de integridade falhou. O arquivo pode estar danificado ou alterado.');
  }
  return payload;
}

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('O navegador não oferece armazenamento local para snapshots.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de backups.'));
  });
}

export async function salvarSnapshotLocal(info: Omit<LocalBackupInfo, 'blob'>, blob: Blob): Promise<void> {
  const db = await abrirBanco();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ ...info, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar snapshot.'));
    tx.onabort = () => reject(tx.error || new Error('Gravação do snapshot cancelada.'));
  });
  const todos = await listarSnapshotsLocais(true);
  const antigos = todos.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(5);
  if (antigos.length) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      antigos.forEach(item => store.delete(item.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Falha ao limpar snapshots antigos.'));
    });
  }
  db.close();
}

export async function listarSnapshotsLocais(incluirBlob = false): Promise<LocalBackupInfo[]> {
  const db = await abrirBanco();
  const result = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Falha ao ler snapshots locais.'));
  });
  db.close();
  return result.map(item => incluirBlob
    ? item as LocalBackupInfo
    : ({ id: item.id, createdAt: item.createdAt, compressedSize: item.compressedSize, uncompressedSize: item.uncompressedSize, compression: item.compression }));
}

export async function obterSnapshotLocal(id: string): Promise<LocalBackupInfo | null> {
  const db = await abrirBanco();
  const item = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir o snapshot.'));
  });
  db.close();
  return item as LocalBackupInfo | null;
}

export function baixarArquivo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
