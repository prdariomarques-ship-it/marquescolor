import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { Loader2, Search } from 'lucide-react';

const TIPO_LABEL: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada (Compra)',
  ENTRADA_DEVOLUCAO: 'Entrada (Devolucao)',
  SAIDA_VENDA: 'Saida (Venda)',
  SAIDA_PERDA: 'Saida (Perda)',
  SAIDA_AVARIA: 'Saida (Avaria)',
  AJUSTE_MANUAL: 'Ajuste Manual',
  CANCELAMENTO_VENDA: 'Cancelamento de Venda',
};

const TIPO_COR: Record<string, string> = {
  ENTRADA_COMPRA: 'text-verde',
  ENTRADA_DEVOLUCAO: 'text-verde',
  SAIDA_VENDA: 'text-vermelho',
  SAIDA_PERDA: 'text-vermelho',
  SAIDA_AVARIA: 'text-vermelho',
  AJUSTE_MANUAL: 'text-azul',
  CANCELAMENTO_VENDA: 'text-azul',
};

export default function Movimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroProduto, setFiltroProduto] = useState('');
  const [page, setPage] = useState(1);

  async function carregar() {
    setCarregando(true);
    try {
      const params: any = { page, pageSize: 50 };
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroProduto) params.produtoId = filtroProduto;
      const res = await api.estoque.movimentacoes(params);
      setMovimentacoes(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [filtroTipo, page]);

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Movimentacoes de estoque</h1>
      <p className="text-sm text-gray-500 mb-6">{total} registro(s)</p>

      <div className="flex gap-2 mb-4">
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1); }} className="input max-w-xs">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-right px-4 py-3">Anterior</th>
              <th className="text-right px-4 py-3">Qtd</th>
              <th className="text-right px-4 py-3">Posterior</th>
              <th className="text-left px-4 py-3">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movimentacoes.map((m: any) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs">{new Date(m.criadoEm).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3 font-medium">{m.produto?.codigoInterno} — {m.produto?.nome}</td>
                <td className={`px-4 py-3 ${TIPO_COR[m.tipo] || ''}`}>{TIPO_LABEL[m.tipo] || m.tipo}</td>
                <td className="px-4 py-3 text-right">{m.saldoAnterior}</td>
                <td className={`px-4 py-3 text-right font-medium ${m.quantidade > 0 ? 'text-verde' : 'text-vermelho'}`}>
                  {m.quantidade > 0 ? '+' : ''}{m.quantidade}
                </td>
                <td className="px-4 py-3 text-right">{m.saldoPosterior}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{m.motivo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movimentacoes.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma movimentacao encontrada</p>}
      </div>

      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
          <span className="px-3 py-1">Pagina {page}</span>
          <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded">Proxima</button>
        </div>
      )}
    </div>
  );
}
