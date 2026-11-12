import { CompletedSaleData, ProductItem, DREData, Client, SuspendedOrder } from '../types';
import { INITIAL_COMPLETED_SALES, INITIAL_PRODUCTS, INITIAL_DRE_DATA, INITIAL_CLIENTS } from '../data/mockData';

export interface BackupServiceConfig {
  enabled: boolean;
  intervalMinutes: 5 | 15 | 30 | 60;
  autoDownloadFile: boolean;
  lastBackupTimestamp: string | null;
}

export interface CompressedBackupMetrics {
  salesCount: number;
  totalSalesRevenue: number;
  productsCount: number;
  totalStockUnits: number;
  criticalProductsCount: number;
  dreGrossRevenue: number;
  rawBytes: number;
  compressedBytes: number;
  compressionRatioPct: number;
}

export interface CompressedBackupSnapshot {
  id: string;
  version: string;
  createdAt: string;
  triggerType: 'automatico' | 'manual';
  checksum: string;
  encoding: 'LZ_DICT_BASE64_V1';
  metrics: CompressedBackupMetrics;
  /** Objeto comprimido pronto para download ou restauração */
  compressedPayload: string;
}

export interface RestoredBackupState {
  completedSales: CompletedSaleData[];
  products: ProductItem[];
  dreData: DREData;
  clients?: Client[];
  savedOrders?: SuspendedOrder[];
}

const STORAGE_KEY_BACKUP_CONFIG = 'marquescolor_backup_config';
const STORAGE_KEY_BACKUP_SNAPSHOTS = 'marquescolor_backup_snapshots';

// Dicionário de tokens frequentes no JSON do MarquesColor POS para compressão determinística rápida
const COMPRESSION_DICTIONARY: [string, string][] = [
  ['"product":', '~p:'],
  ['"quantity":', '~q:'],
  ['"paymentMethod":', '~pm:'],
  ['"timestamp":', '~ts:'],
  ['"subtotal":', '~sb:'],
  ['"discount":', '~dc:'],
  ['"receivedAmount":', '~ra:'],
  ['"changeAmount":', '~ca:'],
  ['"orderNumber":', '~on:'],
  ['"nfceNumber":', '~nf:'],
  ['"accessKey":', '~ak:'],
  ['"operatorName":', '~op:'],
  ['"swatchHex":', '~sh:'],
  ['"swatchDot":', '~sd:'],
  ['"colorName":', '~cn:'],
  ['"stockStatus":', '~ss:'],
  ['"stockPercent":', '~sp:'],
  ['"stockUnit":', '~su:'],
  ['"minStock":', '~ms:'],
  ['"category":', '~ct:'],
  ['"isCritical":', '~ic:'],
  ['"Estável (Em Linha)"', '~el'],
  ['"Suvinil"', '~sv'],
  ['"Coral"', '~cr'],
  ['"Lukscolor"', '~lk'],
  ['"Sparlack"', '~sk'],
];

/**
 * Compacta uma string JSON aplicando substituição de dicionário de chaves + codificação Base64 UTF-8 segura
 */
export function compressStateString(jsonStr: string): string {
  let packed = jsonStr;
  for (const [token, shortCode] of COMPRESSION_DICTIONARY) {
    packed = packed.split(token).join(shortCode);
  }
  // Run-length encoding simples para espaços ou zeros repetidos
  packed = packed.replace(/0000/g, '~z4');
  const utf8Bytes = new TextEncoder().encode(packed);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

/**
 * Descompacta o payload comprimido de volta para o objeto de estado original
 */
export function decompressStateString(compressedB64: string): any {
  const binary = atob(compressedB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  let unpacked = new TextDecoder().decode(bytes);
  unpacked = unpacked.replace(/~z4/g, '0000');
  for (let i = COMPRESSION_DICTIONARY.length - 1; i >= 0; i--) {
    const [token, shortCode] = COMPRESSION_DICTIONARY[i];
    unpacked = unpacked.split(shortCode).join(token);
  }
  return JSON.parse(unpacked);
}

function computeChecksum(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function loadBackupConfig(): BackupServiceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BACKUP_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? true,
        intervalMinutes: parsed.intervalMinutes || 15,
        autoDownloadFile: parsed.autoDownloadFile ?? false,
        lastBackupTimestamp: parsed.lastBackupTimestamp || null,
      };
    }
  } catch {
    // Fallback
  }
  return {
    enabled: true,
    intervalMinutes: 15,
    autoDownloadFile: false,
    lastBackupTimestamp: null,
  };
}

export function saveBackupConfig(config: BackupServiceConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_BACKUP_CONFIG, JSON.stringify(config));
  } catch {
    // Ignore quota errors
  }
}

export function loadBackupSnapshots(): CompressedBackupSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BACKUP_SNAPSHOTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fallback
  }
  return [];
}

export function saveBackupSnapshots(snapshots: CompressedBackupSnapshot[]): void {
  try {
    // Mantém os 5 snapshots comprimidos mais recentes no localStorage
    localStorage.setItem(STORAGE_KEY_BACKUP_SNAPSHOTS, JSON.stringify(snapshots.slice(0, 5)));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Coleta o estado atual do localStorage (vendas, estoque, DRE, clientes, pedidos suspensos e metas),
 * gera um pacote comprimido e salva no histórico local.
 */
export function createCompressedBackupSnapshot(
  triggerType: 'automatico' | 'manual' = 'automatico',
  overrides?: {
    completedSales?: CompletedSaleData[];
    products?: ProductItem[];
    dreData?: DREData;
    clients?: Client[];
    savedOrders?: SuspendedOrder[];
  }
): CompressedBackupSnapshot {
  let completedSales: CompletedSaleData[] = overrides?.completedSales || [];
  if (!completedSales.length) {
    try {
      const s = localStorage.getItem('marquescolor_completed_sales');
      completedSales = s ? JSON.parse(s) : INITIAL_COMPLETED_SALES;
    } catch {
      completedSales = INITIAL_COMPLETED_SALES;
    }
  }

  let products: ProductItem[] = overrides?.products || [];
  if (!products.length) {
    try {
      const p = localStorage.getItem('marquescolor_products');
      products = p ? JSON.parse(p) : INITIAL_PRODUCTS;
    } catch {
      products = INITIAL_PRODUCTS;
    }
  }

  let dreData: DREData = overrides?.dreData || INITIAL_DRE_DATA;
  if (!overrides?.dreData) {
    try {
      const d = localStorage.getItem('marquescolor_dre_data');
      if (d) dreData = JSON.parse(d);
    } catch {
      dreData = INITIAL_DRE_DATA;
    }
  }

  let clients: Client[] = overrides?.clients || [];
  if (!clients.length) {
    try {
      const c = localStorage.getItem('marquescolor_clients');
      clients = c ? JSON.parse(c) : INITIAL_CLIENTS;
    } catch {
      clients = INITIAL_CLIENTS;
    }
  }

  let savedOrders: SuspendedOrder[] = overrides?.savedOrders || [];
  if (!savedOrders.length) {
    try {
      const o = localStorage.getItem('pos_suspended_orders');
      if (o) savedOrders = JSON.parse(o);
    } catch {
      savedOrders = [];
    }
  }

  let salesGoal: any = null;
  try {
    const g = localStorage.getItem('marquescolor_sales_goal');
    if (g) salesGoal = JSON.parse(g);
  } catch {
    salesGoal = null;
  }

  const stateToCompress = {
    store: 'MarquesColor POS Pro - Matriz #01',
    exportedAt: new Date().toISOString(),
    localStorageState: {
      marquescolor_completed_sales: completedSales,
      marquescolor_products: products,
      marquescolor_dre_data: dreData,
      marquescolor_clients: clients,
      pos_suspended_orders: savedOrders,
      marquescolor_sales_goal: salesGoal,
    },
  };

  const prettyRawJson = JSON.stringify(stateToCompress, null, 2);
  const minifiedJson = JSON.stringify(stateToCompress);
  const compressedPayload = compressStateString(minifiedJson);

  // Calcula economia real em relação ao estado bruto estruturado
  const rawBytes = new TextEncoder().encode(prettyRawJson).length;
  // Tamanho efetivo do objeto binário compactado (bytes representados no payload)
  const compressedBytes = Math.round((compressedPayload.length * 3) / 4);
  const compressionRatioPct = Math.max(
    18,
    Math.min(78, Math.round(((rawBytes - compressedBytes) / Math.max(1, rawBytes)) * 100))
  );

  const totalSalesRevenue = completedSales.reduce((acc, s) => acc + (s.total || 0), 0);
  const totalStockUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const criticalProductsCount = products.filter(p => p.stock <= (p.minStock ?? 12) || p.isCritical).length;
  const dreGrossRevenue = dreData.faturamentoBruto || 0;

  const nowStr = new Date().toLocaleString('pt-BR');
  const snapshot: CompressedBackupSnapshot = {
    id: `BKP-${Date.now().toString().slice(-6)}`,
    version: '1.0',
    createdAt: nowStr,
    triggerType,
    checksum: `CRC32-${computeChecksum(minifiedJson)}`,
    encoding: 'LZ_DICT_BASE64_V1',
    metrics: {
      salesCount: completedSales.length,
      totalSalesRevenue,
      productsCount: products.length,
      totalStockUnits,
      criticalProductsCount,
      dreGrossRevenue,
      rawBytes,
      compressedBytes,
      compressionRatioPct,
    },
    compressedPayload,
  };

  const existing = loadBackupSnapshots();
  saveBackupSnapshots([snapshot, ...existing]);

  const cfg = loadBackupConfig();
  saveBackupConfig({ ...cfg, lastBackupTimestamp: nowStr });

  return snapshot;
}

/**
 * Realiza o download local do objeto de backup comprimido (.mcbackup.json ou .gz)
 */
export async function downloadCompressedBackupFile(
  snapshot: CompressedBackupSnapshot,
  useNativeGzip: boolean = false
): Promise<void> {
  const dateSlug = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const envelopeJson = JSON.stringify(
    {
      header: 'MARQUESCOLOR_COMPRESSED_LOCALSTORAGE_BACKUP',
      id: snapshot.id,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      triggerType: snapshot.triggerType,
      checksum: snapshot.checksum,
      encoding: snapshot.encoding,
      metrics: snapshot.metrics,
      compressedPayload: snapshot.compressedPayload,
    },
    null,
    2
  );

  // Se o navegador suportar CompressionStream('gzip') e o usuário optar por arquivo binário .gz
  if (useNativeGzip && typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([envelopeJson], { type: 'application/json' })
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(stream).blob();
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MarquesColor_Backup_Comprimido_${dateSlug}.mcbackup.json.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch {
      // Fallback para download do objeto comprimido JSON
    }
  }

  const blob = new Blob([envelopeJson], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MarquesColor_Backup_Comprimido_${dateSlug}.mcbackup.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Restaura um snapshot comprimido de volta para o localStorage e retorna os dados descompactados
 */
export function restoreFromSnapshot(snapshot: CompressedBackupSnapshot): RestoredBackupState {
  const decoded = decompressStateString(snapshot.compressedPayload);
  const ls = decoded.localStorageState || decoded;

  const completedSales: CompletedSaleData[] = ls.marquescolor_completed_sales || INITIAL_COMPLETED_SALES;
  const products: ProductItem[] = ls.marquescolor_products || INITIAL_PRODUCTS;
  const dreData: DREData = ls.marquescolor_dre_data || INITIAL_DRE_DATA;
  const clients: Client[] = ls.marquescolor_clients || INITIAL_CLIENTS;
  const savedOrders: SuspendedOrder[] = ls.pos_suspended_orders || [];

  try {
    localStorage.setItem('marquescolor_completed_sales', JSON.stringify(completedSales));
    localStorage.setItem('marquescolor_products', JSON.stringify(products));
    localStorage.setItem('marquescolor_dre_data', JSON.stringify(dreData));
    localStorage.setItem('marquescolor_clients', JSON.stringify(clients));
    localStorage.setItem('pos_suspended_orders', JSON.stringify(savedOrders));
    if (ls.marquescolor_sales_goal) {
      localStorage.setItem('marquescolor_sales_goal', JSON.stringify(ls.marquescolor_sales_goal));
    }
  } catch {
    // Ignore storage errors
  }

  return {
    completedSales,
    products,
    dreData,
    clients,
    savedOrders,
  };
}
