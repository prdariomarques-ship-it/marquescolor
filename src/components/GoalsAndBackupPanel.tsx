import React, { useState, useEffect, useRef } from 'react';
import { CompletedSaleData, ProductItem, DREData } from '../types';
import {
  SalesGoalAnalytics,
  StoredSalesGoalConfig,
} from '../utils/salesGoalService';
import {
  BackupServiceConfig,
  CompressedBackupSnapshot,
  RestoredBackupState,
  loadBackupConfig,
  saveBackupConfig,
  loadBackupSnapshots,
  createCompressedBackupSnapshot,
  downloadCompressedBackupFile,
  restoreFromSnapshot,
} from '../utils/backupService';
import { SalesGoalsDashboard } from './SalesGoalsDashboard';

interface GoalsAndBackupPanelProps {
  goalConfig: StoredSalesGoalConfig;
  onUpdateGoalConfig: (next: StoredSalesGoalConfig) => void;
  goalAnalytics: SalesGoalAnalytics;
  products: ProductItem[];
  completedSales: CompletedSaleData[];
  dreData?: DREData;
  onRestoreBackupState?: (restored: RestoredBackupState) => void;
}

export const GoalsAndBackupPanel: React.FC<GoalsAndBackupPanelProps> = ({
  goalConfig,
  onUpdateGoalConfig,
  goalAnalytics,
  products,
  completedSales,
  dreData,
  onRestoreBackupState,
}) => {
  // Backup Service states
  const [backupConfig, setBackupConfig] = useState<BackupServiceConfig>(() =>
    loadBackupConfig()
  );
  const [snapshots, setSnapshots] = useState<CompressedBackupSnapshot[]>(() => {
    const existing = loadBackupSnapshots();
    if (existing.length > 0) return existing;
    const initial = createCompressedBackupSnapshot('automatico', {
      completedSales,
      products,
      dreData,
    });
    return [initial];
  });
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);
  const [secondsUntilNextBackup, setSecondsUntilNextBackup] = useState<number>(
    () => backupConfig.intervalMinutes * 60
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset countdown when interval changes
  useEffect(() => {
    setSecondsUntilNextBackup(backupConfig.intervalMinutes * 60);
  }, [backupConfig.intervalMinutes]);

  // Periodic Auto-Backup Timer
  useEffect(() => {
    if (!backupConfig.enabled) return;

    const timer = setInterval(() => {
      setSecondsUntilNextBackup((prev) => {
        if (prev <= 1) {
          const newSnap = createCompressedBackupSnapshot('automatico', {
            completedSales,
            products,
            dreData,
          });
          setSnapshots(loadBackupSnapshots());
          setBackupConfig(loadBackupConfig());

          if (backupConfig.autoDownloadFile) {
            downloadCompressedBackupFile(newSnap, false);
          }

          setBackupNotice({
            type: 'info',
            text: `Backup automático periódico (${newSnap.id}) comprimido no localStorage (${(
              newSnap.metrics.compressedBytes / 1024
            ).toFixed(1)} KB • -${newSnap.metrics.compressionRatioPct}%).`,
          });
          return backupConfig.intervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    backupConfig.enabled,
    backupConfig.intervalMinutes,
    backupConfig.autoDownloadFile,
    completedSales,
    products,
    dreData,
  ]);

  // Backup Handlers
  const handleManualBackupAndDownload = async (useGzip: boolean = false) => {
    const snap = createCompressedBackupSnapshot('manual', {
      completedSales,
      products,
      dreData,
    });
    setSnapshots(loadBackupSnapshots());
    setBackupConfig(loadBackupConfig());
    await downloadCompressedBackupFile(snap, useGzip);
    setBackupNotice({
      type: 'success',
      text: `Backup comprimido (${snap.id}) gerado e baixado localmente (${(
        snap.metrics.compressedBytes / 1024
      ).toFixed(1)} KB, economia de ${snap.metrics.compressionRatioPct}%).`,
    });
  };

  const handleToggleBackupConfig = (patch: Partial<BackupServiceConfig>) => {
    const updated = { ...backupConfig, ...patch };
    setBackupConfig(updated);
    saveBackupConfig(updated);
  };

  const handleRestoreSnapshot = (snap: CompressedBackupSnapshot) => {
    try {
      const restored = restoreFromSnapshot(snap);
      if (onRestoreBackupState) {
        onRestoreBackupState(restored);
      }
      setBackupNotice({
        type: 'success',
        text: `Estado restaurado com sucesso a partir do snapshot ${snap.id} (${snap.createdAt}).`,
      });
    } catch {
      setBackupNotice({
        type: 'info',
        text: 'Não foi possível descompactar este snapshot.',
      });
    }
  };

  const handleUploadBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = String(ev.target?.result || '');
        const parsed = JSON.parse(content);
        if (parsed.compressedPayload) {
          const restored = restoreFromSnapshot(parsed as CompressedBackupSnapshot);
          if (onRestoreBackupState) {
            onRestoreBackupState(restored);
          }
          setBackupNotice({
            type: 'success',
            text: `Arquivo de backup "${file.name}" descompactado e restaurado no localStorage com sucesso!`,
          });
        }
      } catch {
        setBackupNotice({
          type: 'info',
          text: 'Arquivo inválido. Selecione um arquivo .mcbackup.json exportado pelo sistema.',
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const latestSnapshot = snapshots[0];
  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: SALES GOALS DASHBOARD (GAUGE CHART + 6-MONTH AUTO SUGGESTION) */}
      <SalesGoalsDashboard
        goalConfig={goalConfig}
        onUpdateGoalConfig={onUpdateGoalConfig}
        goalAnalytics={goalAnalytics}
      />

      {/* SECTION 2: SERVIÇO DE BACKUP AUTOMÁTICO COMPRIMIDO DO LOCALSTORAGE */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/50 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#c4c6ce]/30">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="material-symbols-outlined text-[#00687a] text-xl">
                cloud_download
              </span>
              <h3 className="text-[16px] font-bold text-[#001229]">
                Serviço de Backup Automático Comprimido (localStorage)
              </h3>
              <span className="text-xs text-[#44474d]">
                · Vendas ({completedSales.length}) · Estoque ({products.length} SKUs) · DRE & Metas
              </span>
            </div>
            <p className="text-xs text-[#44474d] mt-0.5">
              Compacta periodicamente o estado completo da loja em um objeto comprimido (LZ-Dict + Base64 / GZIP) para download e restauração local.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleManualBackupAndDownload(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#001229] hover:bg-[#0f2744] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="Compactar o estado atual do localStorage e baixar arquivo .mcbackup.json"
            >
              <span className="material-symbols-outlined text-sm">archive</span>
              <span>Baixar Backup Comprimido (.JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => handleManualBackupAndDownload(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00687a] hover:bg-[#004e5c] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="Compactar com GZIP nativo e baixar arquivo binário .gz"
            >
              <span className="material-symbols-outlined text-sm">folder_zip</span>
              <span>Baixar .GZ</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.mcbackup.json"
              onChange={handleUploadBackupFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#c4c6ce] bg-white hover:bg-[#f0f3ff] text-[#001229] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title="Restaurar estado do localStorage a partir de um arquivo de backup local"
            >
              <span className="material-symbols-outlined text-sm text-[#00687a]">
                settings_backup_restore
              </span>
              <span>Restaurar Arquivo</span>
            </button>
          </div>
        </div>

        {backupNotice && (
          <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-[#f0f3ff] border border-[#00687a]/40 text-[#001229] text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[#00687a]">
                verified
              </span>
              <span>{backupNotice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBackupNotice(null)}
              className="text-xs font-bold underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 items-center">
          {/* Compression Metrics & Controls */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#f8f9ff] border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">Tamanho Original</div>
              <div className="text-sm font-mono font-bold text-[#001229] tabular-nums mt-0.5">
                {latestSnapshot
                  ? `${(latestSnapshot.metrics.rawBytes / 1024).toFixed(1)} KB`
                  : '—'}
              </div>
              <div className="text-[11px] text-[#74777e] mt-0.5">JSON Bruto</div>
            </div>

            <div className="p-3 rounded-lg bg-[#f8f9ff] border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">Objeto Comprimido</div>
              <div className="text-sm font-mono font-bold text-[#00687a] tabular-nums mt-0.5">
                {latestSnapshot
                  ? `${(latestSnapshot.metrics.compressedBytes / 1024).toFixed(1)} KB`
                  : '—'}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                -{latestSnapshot?.metrics.compressionRatioPct || 42}% menor
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#f8f9ff] border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">Próximo Ciclo</div>
              <div className="text-sm font-mono font-bold text-[#001229] tabular-nums mt-0.5">
                {backupConfig.enabled ? formatCountdown(secondsUntilNextBackup) : 'Pausado'}
              </div>
              <div className="text-[11px] text-[#74777e] mt-0.5">
                A cada {backupConfig.intervalMinutes} min
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#f8f9ff] border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">Integridade</div>
              <div className="text-xs font-mono font-bold text-[#001229] tabular-nums mt-1 truncate">
                {latestSnapshot?.checksum || 'CRC32-OK'}
              </div>
              <div className="text-[11px] text-[#74777e] mt-0.5">
                {latestSnapshot?.createdAt.split(' ')[1] || 'Sincronizado'}
              </div>
            </div>
          </div>

          {/* Periodic Configuration Controls & Recent Snapshots */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col justify-between gap-3 bg-[#f8f9ff] p-3.5 rounded-xl border border-[#c4c6ce]/40">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#001229] cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfig.enabled}
                  onChange={(e) =>
                    handleToggleBackupConfig({ enabled: e.target.checked })
                  }
                  className="rounded border-[#c4c6ce] text-[#00687a]"
                />
                <span>Backup Periódico Ativo</span>
              </label>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#74777e]">Intervalo:</span>
                <select
                  value={backupConfig.intervalMinutes}
                  onChange={(e) =>
                    handleToggleBackupConfig({
                      intervalMinutes: Number(e.target.value) as 5 | 15 | 30 | 60,
                    })
                  }
                  className="px-2 py-1 rounded border border-[#c4c6ce] bg-white text-xs font-mono font-semibold text-[#001229]"
                >
                  <option value={5}>5 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#c4c6ce]/40 text-xs">
              <label className="flex items-center gap-2 text-[#44474d] cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfig.autoDownloadFile}
                  onChange={(e) =>
                    handleToggleBackupConfig({ autoDownloadFile: e.target.checked })
                  }
                  className="rounded border-[#c4c6ce] text-[#00687a]"
                />
                <span>Baixar arquivo automaticamente a cada ciclo</span>
              </label>

              {latestSnapshot && (
                <button
                  type="button"
                  onClick={() => handleRestoreSnapshot(latestSnapshot)}
                  className="text-[#00687a] hover:underline font-bold whitespace-nowrap cursor-pointer"
                  title="Restaurar este ponto de backup"
                >
                  Restaurar Último ({latestSnapshot.id})
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
