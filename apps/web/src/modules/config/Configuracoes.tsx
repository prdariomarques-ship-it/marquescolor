import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Loader2, Save, Printer } from 'lucide-react';

export default function Configuracoes() {
  const [config, setConfig] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function carregar() {
    setCarregando(true);
    try { setConfig(await api.configuracoes.get()); }
    catch (e: any) { setErro(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  function set(campo: string, valor: any) {
    setConfig({ ...config, [campo]: valor });
  }

  async function salvar() {
    setSalvando(true); setErro(null); setSucesso(false);
    try {
      await api.configuracoes.update(config);
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  if (carregando || !config) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
        <button onClick={salvar} disabled={salvando} className="bg-verde hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2">
          <Save className="w-4 h-4" /> {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {erro && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700">{erro}</div>}
      {sucesso && <div className="mb-4 p-3 rounded bg-green-50 border border-green-200 text-verde">Salvo com sucesso!</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dados da loja */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3">Dados da loja</h2>
          <div className="space-y-3">
            <Campo label="Nome da loja"><input type="text" value={config.nomeLoja || ''} onChange={e => set('nomeLoja', e.target.value)} className="input" /></Campo>
            <Campo label="CNPJ"><input type="text" value={config.cnpj || ''} onChange={e => set('cnpj', e.target.value)} className="input" /></Campo>
            <Campo label="Inscricao Estadual"><input type="text" value={config.inscricaoEstadual || ''} onChange={e => set('inscricaoEstadual', e.target.value)} className="input" /></Campo>
            <Campo label="Endereco"><textarea value={config.endereco || ''} onChange={e => set('endereco', e.target.value)} rows={2} className="input" /></Campo>
            <Campo label="Telefone"><input type="text" value={config.telefone || ''} onChange={e => set('telefone', e.target.value)} className="input" /></Campo>
            <Campo label="WhatsApp"><input type="text" value={config.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} className="input" /></Campo>
          </div>
        </div>

        {/* Vendas */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3">Vendas</h2>
          <label className="flex items-center gap-2 mb-2">
            <input type="checkbox" checked={config.permitirVendaSemEstoque ?? false} onChange={e => set('permitirVendaSemEstoque', e.target.checked)} />
            <span className="text-sm">Permitir venda sem estoque</span>
          </label>
          <p className="text-xs text-gray-500">Se desativado, nao deixa vender produto com estoque zerado.</p>
        </div>

        {/* Impressora */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Printer className="w-5 h-5" /> Impressora (cupom)</h2>
          <div className="space-y-3">
            <Campo label="Largura do cupom">
              <select value={config.larguraCupomMm?.toString() || '80'} onChange={e => set('larguraCupomMm', parseInt(e.target.value))} className="input">
                <option value="58">58mm</option>
                <option value="80">80mm (padrao)</option>
              </select>
            </Campo>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.imprimirAuto ?? false} onChange={e => set('imprimirAuto', e.target.checked)} />
              <span className="text-sm">Imprimir automaticamente apos venda</span>
            </label>
            <Campo label="Cabecalho do cupom"><textarea value={config.cabecalhoCupom || ''} onChange={e => set('cabecalhoCupom', e.target.value)} rows={2} className="input" /></Campo>
            <Campo label="Mensagem final"><input type="text" value={config.mensagemFinal || ''} onChange={e => set('mensagemFinal', e.target.value)} className="input" /></Campo>
            <Campo label="Rodape do cupom"><input type="text" value={config.rodapeCupom || ''} onChange={e => set('rodapeCupom', e.target.value)} className="input" /></Campo>
          </div>
        </div>

        {/* Formas de pagamento ativas */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-gray-800 mb-3">Formas de pagamento</h2>
          <p className="text-sm text-gray-600">Configuradas via JSON. Em B16 havera interface visual.</p>
          <textarea value={config.formasPagamentoAtivas || ''} onChange={e => set('formasPagamentoAtivas', e.target.value)} rows={5} className="input font-mono text-xs" />
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>;
}
