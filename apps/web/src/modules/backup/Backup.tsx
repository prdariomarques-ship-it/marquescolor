import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  carregarConfiguracaoBackup,
  salvarConfiguracaoBackup,
  criarBackupComprimido,
  lerEValidarBackup,
  salvarSnapshotLocal,
  listarSnapshotsLocais,
  obterSnapshotLocal,
  baixarArquivo,
  type BackupSettings,
  type LocalBackupInfo,
} from '../../lib/backupService';
import { Loader2, Download, Upload, AlertTriangle, DatabaseBackup, Clock3, RefreshCw, HardDrive, ShieldCheck } from 'lucide-react';

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function nomeSnapshot(info: LocalBackupInfo): string {
  return info.compression === 'gzip'
    ? `marquescolor-snapshot-${info.id}.mcbackup.json.gz`
    : `marquescolor-snapshot-${info.id}.mcbackup.json`;
}

export default function Backup() {
  const [settings, setSettings] = useState<BackupSettings>(carregarConfiguracaoBackup);
  const [snapshots, setSnapshots] = useState<LocalBackupInfo[]>([]);
  const [exportando, setExportando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [erroAutomatico, setErroAutomatico] = useState<string | null>(null);

  const atualizarSnapshots = useCallback(async () => {
    try {
      setSnapshots(await listarSnapshotsLocais());
    } catch (e: any) {
      setErro(e.message || 'Não foi possível ler os snapshots locais.');
    }
    setUltimoBackup(localStorage.getItem('marquescolor_backup_last_auto'));
    setErroAutomatico(localStorage.getItem('marquescolor_backup_error'));
  }, []);

  useEffect(() => {
    void atualizarSnapshots();
    const atualizar = () => {
      setSettings(carregarConfiguracaoBackup());
      void atualizarSnapshots();
    };
    window.addEventListener('marquescolor-backup-updated', atualizar);
    window.addEventListener('marquescolor-backup-settings', atualizar);
    return () => {
      window.removeEventListener('marquescolor-backup-updated', atualizar);
      window.removeEventListener('marquescolor-backup-settings', atualizar);
    };
  }, [atualizarSnapshots]);

  function atualizarConfig(parcial: Partial<BackupSettings>) {
    setSettings(atual => ({ ...atual, ...parcial }));
  }

  function salvarConfig() {
    salvarConfiguracaoBackup(settings);
    setMensagem('Configurações de backup salvas neste navegador.');
    setErro(null);
  }

  async function handleExportar() {
    setExportando(true); setErro(null); setMensagem(null);
    try {
      const dados = await api.backup.exportar();
      const arquivo = await criarBackupComprimido(dados);
      const createdAt = new Date().toISOString();
      try {
        await salvarSnapshotLocal({
          id: `manual-${createdAt}`,
          createdAt,
          compressedSize: arquivo.compressedSize,
          uncompressedSize: arquivo.uncompressedSize,
          compression: arquivo.compression,
        }, arquivo.blob);
      } catch (storageError) {
        console.warn('Backup baixado, mas não foi possível manter uma cópia local:', storageError);
      }
      baixarArquivo(arquivo.blob, arquivo.filename);
      await atualizarSnapshots();
      setMensagem(`Backup gerado e baixado. Tamanho: ${tamanho(arquivo.compressedSize)} (original: ${tamanho(arquivo.uncompressedSize)}).`);
    } catch (e: any) { setErro(e.message || 'Não foi possível criar o backup.'); }
    finally { setExportando(false); }
  }

  async function restaurarPayload(payload: any) {
    if (!confirm('ATENÇÃO: esta operação substituirá os dados atuais da loja. Deseja continuar?')) return;
    if (!confirm('Confirma novamente a restauração? Faça o download de um backup atual antes de prosseguir.')) return;
    setRestaurando(true); setErro(null); setMensagem(null);
    try {
      await api.backup.restaurar(payload);
      setMensagem('Backup restaurado. A aplicação será recarregada para consultar os dados restaurados.');
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) { setErro(e.message || 'Não foi possível restaurar o backup.'); }
    finally { setRestaurando(false); }
  }

  async function handleRestaurarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErro(null);
      const payload = await lerEValidarBackup(file, file.name);
      await restaurarPayload(payload);
    } catch (e: any) {
      setErro(e.message || 'Arquivo inválido.');
    } finally {
      e.target.value = '';
    }
  }

  async function restaurarSnapshot(id: string) {
    const snapshot = await obterSnapshotLocal(id);
    if (!snapshot?.blob) {
      setErro('O snapshot selecionado não está disponível neste navegador.');
      return;
    }
    try {
      const payload = await lerEValidarBackup(snapshot.blob, nomeSnapshot(snapshot));
      await restaurarPayload(payload);
    } catch (e: any) {
      setErro(e.message || 'Não foi possível ler o snapshot.');
    }
  }

  async function baixarSnapshot(id: string) {
    const snapshot = await obterSnapshotLocal(id);
    if (!snapshot?.blob) {
      setErro('O snapshot selecionado não está disponível neste navegador.');
      return;
    }
    baixarArquivo(snapshot.blob, nomeSnapshot(snapshot));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Backup e restauração</h1>
        <span className="inline-flex items-center gap-2 text-xs rounded-full px-3 py-1 bg-slate-100 text-slate-700">
          <HardDrive className="w-4 h-4" /> Armazenamento local do navegador
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-6">Cópias comprimidas e verificadas dos dados reais do banco da loja. O backup automático funciona enquanto a aplicação estiver aberta e o administrador estiver conectado.</p>

      {mensagem && <div className="mb-4 p-3 rounded bg-green-50 border border-green-200 text-green-800">{mensagem}</div>}
      {erro && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700">{erro}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Clock3 className="w-5 h-5 text-cyan-800" /> Backup automático</h2>
          <label className="flex items-start gap-3 mb-4">
            <input type="checkbox" checked={settings.enabled} onChange={e => atualizarConfig({ enabled: e.target.checked })} className="mt-1" />
            <span><strong className="text-sm text-slate-800">Ativar snapshots automáticos</strong><span className="block text-xs text-slate-500">Cria cópias periódicas e mantém somente os cinco snapshots locais mais recentes.</span></span>
          </label>
          <label className="block text-sm text-slate-700 mb-3">Intervalo
            <select value={settings.intervalMinutes} onChange={e => atualizarConfig({ intervalMinutes: Number(e.target.value) as BackupSettings['intervalMinutes'] })} className="input mt-1">
              <option value={5}>A cada 5 minutos</option><option value={15}>A cada 15 minutos</option>
              <option value={30}>A cada 30 minutos</option><option value={60}>A cada 1 hora</option>
            </select>
          </label>
          <label className="flex items-start gap-3 mb-4">
            <input type="checkbox" checked={settings.automaticDownload} onChange={e => atualizarConfig({ automaticDownload: e.target.checked })} className="mt-1" />
            <span><strong className="text-sm text-slate-800">Também baixar cada cópia automaticamente</strong><span className="block text-xs text-slate-500">O navegador pode solicitar permissão para vários downloads. Desativado, os snapshots ficam guardados no armazenamento local do navegador.</span></span>
          </label>
          <button onClick={salvarConfig} className="bg-azul hover:bg-blue-800 text-white px-4 py-2 rounded text-sm">Salvar configuração</button>
          <div className="mt-4 border-t pt-3 text-xs text-slate-600">
            <p><strong>Status:</strong> {settings.enabled ? 'Programado' : 'Desativado'}</p>
            <p><strong>Último snapshot automático:</strong> {ultimoBackup ? new Date(ultimoBackup).toLocaleString('pt-BR') : 'Ainda não executado'}</p>
            {erroAutomatico && <p className="text-red-700 mt-1">Último erro: {erroAutomatico}</p>}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><DatabaseBackup className="w-5 h-5 text-green-700" /> Backup manual</h2>
          <p className="text-sm text-gray-600 mb-4">Exporta vendas, itens, estoque, clientes, fornecedores, caixa, financeiro, configurações, metas e histórico de auditoria. O arquivo recebe compressão GZIP e checksum SHA-256.</p>
          <button onClick={handleExportar} disabled={exportando} className="bg-verde hover:bg-green-700 text-white px-4 py-2 rounded inline-flex items-center gap-2 disabled:opacity-50">
            {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportando ? 'Gerando...' : 'Baixar backup comprimido agora'}
          </button>
          <div className="mt-4 p-3 rounded bg-slate-50 text-xs text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-green-700 mt-0.5" />
            <span>O arquivo é validado antes da restauração. Backups JSON antigos continuam aceitos para compatibilidade.</span>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-gray-800">Últimos cinco snapshots locais</h2>
          <button onClick={() => void atualizarSnapshots()} className="text-sm text-cyan-800 inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Atualizar</button>
        </div>
        {snapshots.length ? (
          <div className="divide-y">
            {snapshots.map(snapshot => {
              const economia = snapshot.uncompressedSize > 0
                ? Math.max(0, (1 - snapshot.compressedSize / snapshot.uncompressedSize) * 100)
                : 0;
              return <div key={snapshot.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{new Date(snapshot.createdAt).toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-slate-500">{snapshot.compression.toUpperCase()} · {tamanho(snapshot.compressedSize)} de {tamanho(snapshot.uncompressedSize)} · economia {economia.toFixed(1)}%</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void baixarSnapshot(snapshot.id)} className="border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded text-xs inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Baixar</button>
                  <button onClick={() => void restaurarSnapshot(snapshot.id)} disabled={restaurando} className="bg-azul hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs inline-flex items-center gap-1 disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" /> Restaurar</button>
                </div>
              </div>;
            })}
          </div>
        ) : <p className="text-sm text-slate-500 py-5 text-center">Nenhum snapshot local foi criado neste navegador.</p>}
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Upload className="w-5 h-5 text-azul" /> Restaurar arquivo externo</h2>
        <div className="bg-amber-50 border border-amber-200 p-3 rounded mb-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
          <p className="text-gray-700"><strong>Atenção:</strong> a restauração substitui os dados atuais do banco. Faça um backup antes. A integridade do arquivo é verificada antes de enviar os dados ao servidor.</p>
        </div>
        <label className="bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded inline-flex items-center gap-2 cursor-pointer">
          {restaurando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {restaurando ? 'Restaurando...' : 'Selecionar backup (.json ou .gz)'}
          <input type="file" accept=".json,.gz,application/json,application/gzip" onChange={handleRestaurarArquivo} className="hidden" disabled={restaurando} />
        </label>
      </section>
    </div>
  );
}
