import { useState } from 'react';
import { api } from '../../lib/api';
import { Loader2, Download, Upload, AlertTriangle } from 'lucide-react';

export default function Backup() {
  const [exportando, setExportando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleExportar() {
    setExportando(true); setErro(null); setMensagem(null);
    try {
      const dados = await api.backup.exportar();
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-marquescollor-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMensagem('Backup exportado com sucesso!');
    } catch (e: any) { setErro(e.message); }
    finally { setExportando(false); }
  }

  async function handleRestaurar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('ATENCAO: restaurar vai SUBSCREVER todos os dados. Continuar?')) {
      e.target.value = ''; return;
    }
    setRestaurando(true); setErro(null); setMensagem(null);
    try {
      const texto = await file.text();
      const dados = JSON.parse(texto);
      await api.backup.restaurar(dados);
      setMensagem('Backup restaurado com sucesso! Recarregue a pagina.');
    } catch (e: any) { setErro(e.message); }
    finally { setRestaurando(false); e.target.value = ''; }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Backup e restauracao</h1>
      <p className="text-sm text-gray-500 mb-6">Exporte todos os dados em JSON ou restaure a partir de um arquivo</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Download className="w-5 h-5 text-verde" /> Exportar</h2>
          <p className="text-sm text-gray-600 mb-4">Gera um arquivo JSON com todas as tabelas (produtos, vendas, clientes, configuracoes, etc.).</p>
          <button onClick={handleExportar} disabled={exportando} className="bg-verde hover:bg-green-700 text-white px-4 py-2 rounded inline-flex items-center gap-2 disabled:opacity-50">
            {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportando ? 'Exportando...' : 'Exportar backup'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Upload className="w-5 h-5 text-azul" /> Restaurar</h2>
          <div className="bg-amarelo/10 border border-amarelo p-3 rounded mb-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amarelo mt-0.5" />
            <p className="text-gray-700"><strong>Atencao:</strong> restaurar substitui TODOS os dados atuais pelos dados do arquivo.</p>
          </div>
          <label className="bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded inline-flex items-center gap-2 cursor-pointer">
            {restaurando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {restaurando ? 'Restaurando...' : 'Selecionar arquivo JSON'}
            <input type="file" accept=".json,application/json" onChange={handleRestaurar} className="hidden" />
          </label>
        </div>
      </div>

      {mensagem && <div className="mt-4 p-3 rounded bg-green-50 border border-green-200 text-verde">{mensagem}</div>}
      {erro && <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700">{erro}</div>}
    </div>
  );
}
