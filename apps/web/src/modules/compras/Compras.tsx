import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, Plus, Check } from 'lucide-react';

export default function Compras() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [compras, setCompras] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await api.compras.list({ pageSize: 100 });
      setCompras(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function handleConfirmar(c: any) {
    if (!confirm(`Confirmar compra ${c.numeroPedido || c.id}? Isto dara entrada em estoque.`)) return;
    try { await api.compras.confirmar(c.id); await carregar(); alert('Entrada em estoque registrada'); }
    catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-500">{total} compra(s) registrada(s)</p>
        </div>
        {podeEditar && (
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded">
            <Plus className="w-4 h-4" /> Nova compra
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Fornecedor</th>
              <th className="text-left px-4 py-3">Pedido</th>
              <th className="text-right px-4 py-3">Subtotal</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {compras.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs">{formatarDataHora(c.dataCompra)}</td>
                <td className="px-4 py-3">{c.fornecedor?.razaoSocial}</td>
                <td className="px-4 py-3">{c.numeroPedido || '-'}</td>
                <td className="px-4 py-3 text-right">{formatarCentavos(c.subtotalCentavos)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatarCentavos(c.totalCentavos)}</td>
                <td className="px-4 py-3">
                  <span className={c.status === 'CONFIRMADA' ? 'text-verde' : 'text-amarelo'}>{c.status}</span>
                </td>
                <td className="px-4 py-3">
                  {podeEditar && c.status === 'RASCUNHO' && (
                    <button onClick={() => handleConfirmar(c)} className="text-verde hover:bg-green-100 p-1.5 rounded" title="Confirmar (entrada em estoque)">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {compras.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma compra registrada</p>}
      </div>

      {modal && <ModalNovaCompra onClose={() => setModal(false)} onSaved={carregar} />}
    </div>
  );
}

function ModalNovaCompra({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fornecedorId, setFornecedorId] = useState('');
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [numeroPedido, setNumeroPedido] = useState('');
  const [frete, setFrete] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [itens, setItens] = useState<Array<any>>([]);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.fornecedores.list({ ativo: 'true', pageSize: 100 }).then(r => setFornecedores(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!buscaProduto.trim()) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const r = await api.produtosBusca(buscaProduto);
      setResultados(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [buscaProduto]);

  function adicionarItem(p: any) {
    setItens([...itens, { produtoId: p.id, nome: p.nome, quantidade: 1, precoCustoCentavos: p.precoCustoCentavos }]);
    setBuscaProduto('');
    setResultados([]);
  }

  function alterarItem(idx: number, campo: string, valor: any) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  }

  function removerItem(idx: number) { setItens(prev => prev.filter((_, i) => i !== idx)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fornecedorId) { setErro('Selecione um fornecedor'); return; }
    if (itens.length === 0) { setErro('Adicione ao menos 1 item'); return; }
    setSalvando(true); setErro(null);
    try {
      await api.compras.create({
        fornecedorId,
        numeroPedido,
        freteCentavos: Math.round(frete * 100),
        descontoCentavos: Math.round(desconto * 100),
        itens: itens.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoCustoCentavos: it.precoCustoCentavos,
        })),
        status: 'RASCUNHO',
      });
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  const subtotal = itens.reduce((acc, it) => acc + it.precoCustoCentavos * it.quantidade, 0);
  const total = Math.max(0, subtotal - desconto * 100 + frete * 100);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Nova compra</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
              <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} required className="input">
                <option value="">Selecione...</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numero pedido</label>
              <input type="text" value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} className="input" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar produto</label>
            <input type="text" value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} placeholder="Nome do produto..." className="input" />
            {resultados.length > 0 && (
              <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                {resultados.map(p => (
                  <button key={p.id} type="button" onClick={() => adicionarItem(p)} className="w-full text-left p-2 hover:bg-blue-50 border-b text-sm">
                    {p.nome} — Custo: {formatarCentavos(p.precoCustoCentavos)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Itens</label>
            <table className="w-full text-sm border">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Produto</th><th className="text-right p-2">Qtd</th><th className="text-right p-2">Custo (R$)</th><th></th></tr></thead>
              <tbody className="divide-y">
                {itens.map((it, idx) => (
                  <tr key={idx}>
                    <td className="p-2 text-xs">{it.nome}</td>
                    <td className="p-2"><input type="number" min="0.001" step="0.001" value={it.quantidade} onChange={e => alterarItem(idx, 'quantidade', parseFloat(e.target.value) || 0)} className="w-16 px-1 border rounded text-right" /></td>
                    <td className="p-2"><input type="number" min="0" step="0.01" value={it.precoCustoCentavos / 100} onChange={e => alterarItem(idx, 'precoCustoCentavos', Math.round(parseFloat(e.target.value) * 100))} className="w-24 px-1 border rounded text-right" /></td>
                    <td className="p-2"><button type="button" onClick={() => removerItem(idx)} className="text-vermelho">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (R$)</label>
              <input type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frete (R$)</label>
              <input type="number" min="0" step="0.01" value={frete} onChange={e => setFrete(parseFloat(e.target.value) || 0)} className="input" />
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(subtotal)}</span></div>
            <div className="flex justify-between font-bold text-lg"><span>Total:</span><span>{formatarCentavos(total)}</span></div>
          </div>

          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Criar compra (rascunho)'}
          </button>
        </form>
      </div>
    </div>
  );
}
