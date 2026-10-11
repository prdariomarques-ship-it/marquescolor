import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, Plus, Check, Ban, Trash2 } from 'lucide-react';

const STATUS_COR: Record<string, string> = {
  ABERTO: 'text-azul',
  APROVADO: 'text-verde',
  CONVERTIDO: 'text-azul',
  CANCELADO: 'text-vermelho',
  EXPIRADO: 'text-amarelo',
};

export default function Orcamentos() {
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await api.orcamentos.list({ pageSize: 100 });
      setOrcamentos(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orcamentos</h1>
          <p className="text-sm text-gray-500">{total} orcamento(s)</p>
        </div>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded">
          <Plus className="w-4 h-4" /> Novo orcamento
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Validade</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orcamentos.map((o: any) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono">#{o.numero}</td>
                <td className="px-4 py-3 text-xs">{formatarDataHora(o.criadoEm)}</td>
                <td className="px-4 py-3">{o.cliente?.nome || 'Anonimo'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatarCentavos(o.totalCentavos)}</td>
                <td className="px-4 py-3 text-xs">{o.validade ? formatarDataHora(o.validade) : '-'}</td>
                <td className={`px-4 py-3 ${STATUS_COR[o.status]} font-medium`}>{o.status}</td>
                <td className="px-4 py-3">
                  {o.status === 'ABERTO' && (
                    <>
                      <button onClick={async () => { await api.orcamentos.aprovar(o.id); await carregar(); }} className="text-verde p-1 hover:bg-green-100 rounded" title="Aprovar"><Check className="w-4 h-4" /></button>
                      <button onClick={async () => { await api.orcamentos.cancelar(o.id); await carregar(); }} className="text-vermelho p-1 hover:bg-red-100 rounded" title="Cancelar"><Ban className="w-4 h-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orcamentos.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum orcamento</p>}
      </div>

      {modal && <ModalNovoOrcamento onClose={() => setModal(false)} onSaved={carregar} />}
    </div>
  );
}

function ModalNovoOrcamento({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [itens, setItens] = useState<Array<any>>([]);
  const [validade, setValidade] = useState('');
  const [desconto, setDesconto] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.clientes.list({ pageSize: 100 }).then(r => setClientes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const r = await api.produtosBusca(busca);
      setResultados(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  function adicionar(p: any) {
    setItens([...itens, { produtoId: p.id, nome: p.nome, quantidade: 1, precoUnitarioCentavos: p.precoVendaCentavos, descontoItemCentavos: 0 }]);
    setBusca(''); setResultados([]);
  }

  function alterar(idx: number, campo: string, valor: any) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  }

  function remover(idx: number) { setItens(prev => prev.filter((_, i) => i !== idx)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (itens.length === 0) { setErro('Adicione ao menos 1 item'); return; }
    setSalvando(true); setErro(null);
    try {
      await api.orcamentos.create({
        clienteId: clienteId || null,
        validade: validade || undefined,
        descontoCentavos: Math.round(desconto * 100),
        itens: itens.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoUnitarioCentavos: it.precoUnitarioCentavos,
          descontoItemCentavos: it.descontoItemCentavos,
        })),
      });
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  const subtotal = itens.reduce((acc, it) => acc + it.precoUnitarioCentavos * it.quantidade - it.descontoItemCentavos, 0);
  const total = Math.max(0, subtotal - desconto * 100);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo orcamento</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (opcional)</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="input">
                <option value="">Sem cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
              <input type="date" value={validade} onChange={e => setValidade(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar produto</label>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome do produto..." className="input" />
            {resultados.length > 0 && (
              <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                {resultados.map(p => (
                  <button key={p.id} type="button" onClick={() => adicionar(p)} className="w-full text-left p-2 hover:bg-blue-50 border-b text-sm">
                    {p.nome} — {formatarCentavos(p.precoVendaCentavos)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <table className="w-full text-sm border">
            <thead className="bg-gray-50"><tr><th className="text-left p-2">Produto</th><th className="text-right p-2">Qtd</th><th className="text-right p-2">Unit</th><th></th></tr></thead>
            <tbody className="divide-y">
              {itens.map((it, idx) => (
                <tr key={idx}>
                  <td className="p-2 text-xs">{it.nome}</td>
                  <td className="p-2"><input type="number" min="0.001" step="0.001" value={it.quantidade} onChange={e => alterar(idx, 'quantidade', parseFloat(e.target.value) || 0)} className="w-16 px-1 border rounded text-right" /></td>
                  <td className="p-2"><input type="number" min="0" step="0.01" value={it.precoUnitarioCentavos / 100} onChange={e => alterar(idx, 'precoUnitarioCentavos', Math.round(parseFloat(e.target.value) * 100))} className="w-24 px-1 border rounded text-right" /></td>
                  <td className="p-2"><button type="button" onClick={() => remover(idx)} className="text-vermelho">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (R$)</label>
            <input type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} className="input" />
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(subtotal)}</span></div>
            <div className="flex justify-between font-bold text-lg"><span>Total:</span><span>{formatarCentavos(total)}</span></div>
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Criar orcamento'}
          </button>
        </form>
      </div>
    </div>
  );
}
