import { useEffect, useState } from 'react';
import { useAuth } from '../../stores/auth';
import { api } from '../../lib/api';
import {
  carregarConfiguracaoBackup,
  criarBackupComprimido,
  salvarSnapshotLocal,
  baixarArquivo,
} from '../../lib/backupService';

export default function BackupScheduler() {
  const { usuario } = useAuth();
  const [settings, setSettings] = useState(carregarConfiguracaoBackup);

  useEffect(() => {
    const atualizar = () => setSettings(carregarConfiguracaoBackup());
    window.addEventListener('marquescolor-backup-settings', atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener('marquescolor-backup-settings', atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  useEffect(() => {
    if (!settings.enabled || usuario?.papel !== 'ADMIN') return;

    let ocupado = false;
    let intervalId: number | undefined;
    const intervaloMs = settings.intervalMinutes * 60 * 1000;

    const executar = async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        const dados = await api.backup.exportar();
        const arquivo = await criarBackupComprimido(dados);
        const createdAt = new Date().toISOString();
        const id = `auto-${createdAt}`;
        await salvarSnapshotLocal({
          id,
          createdAt,
          compressedSize: arquivo.compressedSize,
          uncompressedSize: arquivo.uncompressedSize,
          compression: arquivo.compression,
        }, arquivo.blob);
        localStorage.setItem('marquescolor_backup_last_auto', createdAt);
        window.dispatchEvent(new Event('marquescolor-backup-updated'));
        if (settings.automaticDownload) baixarArquivo(arquivo.blob, arquivo.filename);
      } catch (error) {
        console.error('Backup automático local não concluído:', error);
        localStorage.setItem('marquescolor_backup_error', error instanceof Error ? error.message : 'Falha no backup automático');
        window.dispatchEvent(new Event('marquescolor-backup-updated'));
      } finally {
        ocupado = false;
      }
    };

    const ultimo = localStorage.getItem('marquescolor_backup_last_auto');
    const decorrido = ultimo ? Date.now() - new Date(ultimo).getTime() : intervaloMs;
    const primeiraExecucao = Math.max(0, intervaloMs - (Number.isFinite(decorrido) ? decorrido : intervaloMs));
    const timeoutId = window.setTimeout(() => {
      void executar();
      intervalId = window.setInterval(() => void executar(), intervaloMs);
    }, primeiraExecucao);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [settings.enabled, settings.intervalMinutes, settings.automaticDownload, usuario?.id, usuario?.papel]);

  return null;
}
