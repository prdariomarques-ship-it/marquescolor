import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { Loader2, Search, PlusCircle, MinusCircle, Sliders } from 'lucide-react';

interface ProdutoEstoque {
  id: string;
  codigoInterno: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  ativo: boolean;
  status: 'ok' | 'baixo' | 'esgotado';
  marca: { nome: string } | null;
  categoria: { nome: string } | null;
}

const STATUS_COR: Record<string, string> = {
  ok: 'text-verde',
  baixo: 'text-amarelo',
  esgotado: 'text-vermelho',
};

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  baixo: 'Estoque baixo',
  esgotado: 'Esgotado',
};

export default function Estoque() {
  const { usuario } = useAuth();
  const podeAjustar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'baixo' | 'zero' | 'negativo'>('todos');
  const [modal, setModal] = useState<{ tipo: 'entrada' | 'saida' | 'ajuste'; produto: ProdutoEstoque } | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const params: any = { busca, pageSize: 100 };
      if (filtroStatus === 'baixo') params.status = 'baixo';
      if (filtroStatus === 'zero') params.status = 'zero';
      if (filtroStatus === 'negativo') params.status = 'negativo';
      const res = await api.estoque.visaoGeral(params);
      setProdutos(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [busca, filtroStatus]);

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <p className="text-sm text-gray-500">{total} produto(s) — visao geral de saldos</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} className="input pl-9 max-w-sm" />
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} className="input max-w-xs">
          <option value="todos">Todos</option>
          <option value="baixo">Estoque baixo</option>
          <option value="zero">Zerado</option>
          <option value="negativo">Negativo</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Codigo</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Marca</th>
              <th className="text-right px-4 py-3">Atual</th>
              <th className="text-right px-4 py-3">Minimo</th>
              <th className="text-right px-4 py-3">Maximo</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {produtos.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 ${!p.ativo ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs">{p.codigoInterno}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                <td className="px-4 py-3">{p.marca?.nome || '-'}</td>
                <td className="px-4 py-3 text-right font-medium">{p.estoqueAtual} {p.unidade}</td>
                <td className="px-4 py-3 text-right text-gray-500">{p.estoqueMinimo}</td>
                <td className="px-4 py-3 text-right text-gray-500">{p.estoqueMaximo}</td>
                <td className="px-4 py-3">
                  <span className={`${STATUS_COR[p.status]} font-medium`}>{STATUS_LABEL[p.status]}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setModal({ tipo: 'entrada', produto: p })} className="p-1.5 text-verde hover:bg-green-100 rounded" title="Entrada"><PlusCircle className="w-4 h-4" /></button>
                  {podeAjustar && (
                    <>
                      <button onClick={() => setModal({ tipo: 'saida', produto: p })} className="p-1.5 text-vermelho hover:bg-red-100 rounded" title="Saida (perda/avaria)"><MinusCircle className="w-4 h-4" /></button>
                      <button onClick={() => setModal({ tipo: 'ajuste', produto: p })} className="p-1.5 text-azul hover:bg-blue-100 rounded" title="Ajuste"><Sliders className="w-4 h-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {produtos.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum produto encontrado</p>}
      </div>

      {modal && <ModalMovimentacao modal={modal} onClose={() => setModal(null)} onSaved={carregar} podeAjustar={podeAjustar} />}
    </div>
  );
}

function ModalMovimentacao({ modal, onClose, onSaved, podeAjustar }: { modal: { tipo: 'entrada' | 'saida' | 'ajuste'; produto: ProdutoEstoque }; onClose: () => void; onSaved: () => void; podeAjustar: boolean }) {
  const { tipo, produto } = modal;
  const [quantidade, setQuantidade] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [tipoSaida, setTipoSaida] = useState<'SAIDA_PERDA' | 'SAIDA_AVARIA'>('SAIDA_PERDA');
  const [documentoRef, setDocumentoRef] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      if (tipo === 'entrada') {
        await api.estoque.entrada({ produtoId: produto.id, quantidade, motivo, documentoRef });
      } else if (tipo === 'saida') {
        await api.estoque.saida({ produtoId: produto.id, quantidade, tipo: tipoSaida, motivo, documentoRef });
      } else {
        await api.estoque.ajuste({ produtoId: produto.id, quantidade, motivo, documentoRef });
      }
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  const titulo = tipo === 'entrada' ? 'Entrada manual' : tipo === 'saida' ? 'Saida (perda/avaria)' : 'Ajuste manual';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <p><strong>{produto.nome}</strong></p>
          <p className="text-xs text-gray-500">Codigo: {produto.codigoInterno} · Estoque atual: {produto.estoqueAtual} {produto.unidade}</p>
        </div>
        {tipo === 'saida' && !podeAjustar && (
          <p className="text-vermelho text-sm mb-3">Voce nao tem permissao para saida manual.</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {tipo === 'ajuste' ? 'Quantidade (+ ou -)' : 'Quantidade'}
            </label>
            <input
              type="number" step="0.001"
              value={quantidade}
              onChange={e => setQuantidade(parseFloat(e.target.value) || 0)}
              required
              className="input"
            />
          </div>
          {tipo === 'saida' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={tipoSaida} onChange={e => setTipoSaida(e.target.value as any)} className="input">
                <option value="SAIDA_PERDA">Perda</option>
                <option value="SAIDA_AVARIA">Avaria</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {tipo === 'ajuste' ? 'Motivo (obrigatorio)' : 'Motivo'}
            </label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} required={tipo === 'ajuste' || tipo === 'saida'} className="input" rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Documento ref (opcional)</label>
            <input type="text" value={documentoRef} onChange={e => setDocumentoRef(e.target.value)} className="input" />
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Confirmar'}
          </button>
        </form>
      </div>
    </div>
  );
}
