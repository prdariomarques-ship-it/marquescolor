import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, Search, Eye, Ban, Printer } from 'lucide-react';
import { CupomNaoFiscal } from '../cupom/CupomNaoFiscal';

const STATUS_COR: Record<string, string> = {
  RASCUNHO: 'text-gray-500',
  FINALIZADA: 'text-verde',
  CANCELADA: 'text-vermelho',
};

export default function Vendas() {
  const { usuario } = useAuth();
  const podeCancelar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [vendas, setVendas] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [modalCancelar, setModalCancelar] = useState<string | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    api.configuracoes.get().then(setConfig).catch(() => {});
  }, []);

  async function verDetalhe(v: any) {
    try {
      const detalhe = await api.vendas.get(v.id);
      setDetalhe(detalhe);
    } catch (e: any) { alert(e.message); }
  }

  async function carregar() {
    setCarregando(true);
    try {
      const params: any = { page, pageSize: 50 };
      if (filtroStatus) params.status = filtroStatus;
      const res = await api.vendas.list(params);
      setVendas(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [filtroStatus, page]);

  async function handleCancelar(id: string) {
    if (!motivoCancelamento || motivoCancelamento.length < 3) { alert('Motivo deve ter pelo menos 3 caracteres'); return; }
    try {
      await api.vendas.cancelar(id, motivoCancelamento);
      setModalCancelar(null);
      setMotivoCancelamento('');
      await carregar();
      alert('Venda cancelada com sucesso');
    } catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Vendas</h1>
      <p className="text-sm text-gray-500 mb-6">{total} venda(s)</p>

      <div className="flex gap-2 mb-4">
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1); }} className="input max-w-xs">
          <option value="">Todos os status</option>
          <option value="FINALIZADA">Finalizadas</option>
          <option value="CANCELADA">Canceladas</option>
          <option value="RASCUNHO">Rascunho</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-right px-4 py-3">Itens</th>
              <th className="text-right px-4 py-3">Subtotal</th>
              <th className="text-right px-4 py-3">Desc.</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendas.map((v: any) => (
              <tr key={v.id} className={`hover:bg-gray-50 ${v.status === 'CANCELADA' ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-mono">#{v.numero}</td>
                <td className="px-4 py-3 text-xs">{formatarDataHora(v.criadoEm)}</td>
                <td className="px-4 py-3">{v.cliente?.nome || 'Anonima'}</td>
                <td className="px-4 py-3 text-right">{v.itens?.length || 0}</td>
                <td className="px-4 py-3 text-right">{formatarCentavos(v.subtotalCentavos)}</td>
                <td className="px-4 py-3 text-right text-vermelho">{v.descontoCentavos > 0 ? `-${formatarCentavos(v.descontoCentavos)}` : '-'}</td>
                <td className="px-4 py-3 text-right font-bold text-verde">{formatarCentavos(v.totalCentavos)}</td>
                <td className={`px-4 py-3 ${STATUS_COR[v.status]} font-medium`}>{v.status}</td>
                <td className="px-4 py-3">
                  <button onClick={() => verDetalhe(v)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Detalhes"><Eye className="w-4 h-4" /></button>
                  {podeCancelar && v.status === 'FINALIZADA' && (
                    <button onClick={() => setModalCancelar(v.id)} className="p-1.5 text-vermelho hover:bg-red-100 rounded" title="Cancelar venda"><Ban className="w-4 h-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vendas.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma venda encontrada</p>}
      </div>

      {/* Detalhe modal */}
      {detalhe && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDetalhe(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-bold">Venda #{detalhe.numero}</h2>
              <button onClick={() => setDetalhe(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <p className="text-sm text-gray-600">Data: {formatarDataHora(detalhe.criadoEm)}</p>
            {detalhe.cliente && <p className="text-sm">Cliente: {detalhe.cliente.nome}</p>}
            <table className="w-full text-sm mt-3 border">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Item</th><th className="text-right p-2">Qtd</th><th className="text-right p-2">Unit</th><th className="text-right p-2">Sub</th></tr></thead>
              <tbody className="divide-y">
                {detalhe.itens?.map((it: any) => (
                  <tr key={it.id}>
                    <td className="p-2">{it.nomeProdutoSnapshot}</td>
                    <td className="p-2 text-right">{it.quantidade}</td>
                    <td className="p-2 text-right">{formatarCentavos(it.precoUnitarioCentavos)}</td>
                    <td className="p-2 text-right">{formatarCentavos(it.subtotalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(detalhe.subtotalCentavos)}</span></div>
              {detalhe.descontoCentavos > 0 && <div className="flex justify-between text-vermelho"><span>Desconto:</span><span>-{formatarCentavos(detalhe.descontoCentavos)}</span></div>}
              {detalhe.acrescimoCentavos > 0 && <div className="flex justify-between text-verde"><span>Acrescimo:</span><span>+{formatarCentavos(detalhe.acrescimoCentavos)}</span></div>}
              <div className="flex justify-between text-lg font-bold text-azul border-t pt-1"><span>Total:</span><span>{formatarCentavos(detalhe.totalCentavos)}</span></div>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium">Pagamentos</p>
              {detalhe.pagamentos?.map((p: any) => (
                <p key={p.id} className="text-sm">{p.forma}: {formatarCentavos(p.valorCentavos)} {p.parcelas > 1 ? `(${p.parcelas}x)` : ''}</p>
              ))}
            </div>

            {detalhe.status === 'FINALIZADA' && config && (
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-center bg-white">
                  <CupomNaoFiscal venda={detalhe} config={config} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancelar modal */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModalCancelar(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-vermelho mb-3">Cancelar venda</h2>
            <p className="text-sm text-gray-600 mb-3">Esta acao NAO exclui a venda — apenas muda status para CANCELADA, estorna o estoque e estorna o caixa.</p>
            <textarea value={motivoCancelamento} onChange={e => setMotivoCancelamento(e.target.value)} placeholder="Motivo do cancelamento" rows={3} className="input" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setModalCancelar(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 rounded">Voltar</button>
              <button onClick={() => handleCancelar(modalCancelar)} className="flex-1 bg-vermelho hover:bg-red-700 text-white py-2 rounded">Confirmar cancelamento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
