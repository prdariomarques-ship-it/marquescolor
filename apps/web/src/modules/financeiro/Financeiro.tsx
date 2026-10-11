import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarData } from '../../lib/format';
import { Loader2, Plus, Check, Ban } from 'lucide-react';

const STATUS_COR: Record<string, string> = {
  PENDENTE: 'text-amarelo',
  PAGO: 'text-verde',
  ATRASADO: 'text-vermelho',
  CANCELADO: 'text-gray-500',
};

export default function Financeiro() {
  const { usuario } = useAuth();
  const podePagar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [aba, setAba] = useState<'receber' | 'pagar'>('receber');
  const [contas, setContas] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [modalBaixa, setModalBaixa] = useState<string | null>(null);
  const [valorBaixa, setValorBaixa] = useState(0);

  async function carregar() {
    setCarregando(true);
    try {
      const params: any = { pageSize: 100 };
      if (filtroStatus) params.status = filtroStatus;
      const res = aba === 'receber'
        ? await api.financeiro.contasReceber(params)
        : await api.financeiro.contasPagar(params);
      setContas(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [aba, filtroStatus]);

  async function handleBaixar(id: string) {
    if (valorBaixa <= 0) { alert('Valor invalido'); return; }
    try {
      if (aba === 'receber') await api.financeiro.baixarContaReceber(id, { valorPagoCentavos: Math.round(valorBaixa * 100) });
      else await api.financeiro.baixarContaPagar(id, { valorPagoCentavos: Math.round(valorBaixa * 100) });
      setModalBaixa(null); setValorBaixa(0); carregar();
    } catch (e: any) { alert(e.message); }
  }

  async function handleCancelar(id: string) {
    if (!confirm('Cancelar esta conta?')) return;
    try {
      if (aba === 'receber') await api.financeiro.cancelarContaReceber(id);
      else await api.financeiro.cancelarContaPagar(id);
      carregar();
    } catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded">
          <Plus className="w-4 h-4" /> Nova conta
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAba('receber')} className={`px-4 py-2 rounded ${aba === 'receber' ? 'bg-azul text-white' : 'bg-white border'}`}>Contas a receber</button>
        <button onClick={() => setAba('pagar')} className={`px-4 py-2 rounded ${aba === 'pagar' ? 'bg-azul text-white' : 'bg-white border'}`}>Contas a pagar</button>
      </div>

      <div className="flex gap-2 mb-4">
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="input max-w-xs">
          <option value="">Todos</option>
          <option value="PENDENTE">Pendente</option>
          <option value="PAGO">Pago</option>
          <option value="ATRASADO">Atrasado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Descricao</th>
              <th className="text-left px-4 py-3">{aba === 'receber' ? 'Cliente' : 'Fornecedor'}</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="text-left px-4 py-3">Vencimento</th>
              <th className="text-left px-4 py-3">Pago em</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contas.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{c.descricao}</td>
                <td className="px-4 py-3">{c.cliente?.nome || c.fornecedor?.razaoSocial || '-'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatarCentavos(c.valorCentavos)}</td>
                <td className="px-4 py-3 text-xs">{formatarData(c.vencimento)}</td>
                <td className="px-4 py-3 text-xs">{c.pagoEm ? formatarData(c.pagoEm) : '-'}</td>
                <td className={`px-4 py-3 ${STATUS_COR[c.status]} font-medium`}>{c.status}</td>
                <td className="px-4 py-3">
                  {c.status === 'PENDENTE' && (
                    <>
                      <button onClick={() => { setModalBaixa(c.id); setValorBaixa(c.valorCentavos / 100); }} className="text-verde p-1 hover:bg-green-100 rounded" title="Dar baixa"><Check className="w-4 h-4" /></button>
                      {(podePagar || aba === 'receber') && (
                        <button onClick={() => handleCancelar(c.id)} className="text-vermelho p-1 hover:bg-red-100 rounded" title="Cancelar"><Ban className="w-4 h-4" /></button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contas.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma conta</p>}
      </div>

      {modalBaixa && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModalBaixa(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Dar baixa</h2>
            <label className="block text-sm mb-1">Valor pago (R$)</label>
            <input type="number" step="0.01" value={valorBaixa} onChange={e => setValorBaixa(parseFloat(e.target.value) || 0)} className="input" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setModalBaixa(null)} className="flex-1 bg-gray-200 py-2 rounded">Cancelar</button>
              <button onClick={() => handleBaixar(modalBaixa)} className="flex-1 bg-verde text-white py-2 rounded">Confirmar baixa</button>
            </div>
          </div>
        </div>
      )}

      {modal && <ModalNovaConta tipo={aba} podePagar={podePagar} onClose={() => setModal(false)} onSaved={carregar} />}
    </div>
  );
}

function ModalNovaConta({ tipo, podePagar, onClose, onSaved }: { tipo: 'receber' | 'pagar'; podePagar: boolean; onClose: () => void; onSaved: () => void }) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(0);
  const [vencimento, setVencimento] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.clientes.list({ pageSize: 100 }).then(r => setClientes(r.data)).catch(() => {});
    api.fornecedores.list({ pageSize: 100 }).then(r => setFornecedores(r.data)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao || !vencimento || valor <= 0) { setErro('Preencha todos os campos'); return; }
    if (tipo === 'receber' && !clienteId) { setErro('Selecione um cliente'); return; }
    if (tipo === 'pagar' && podePagar && !fornecedorId) { setErro('Selecione um fornecedor'); return; }
    setSalvando(true); setErro(null);
    try {
      const data = {
        descricao,
        valorCentavos: Math.round(valor * 100),
        vencimento,
        clienteId: tipo === 'receber' ? clienteId : null,
        fornecedorId: tipo === 'pagar' ? fornecedorId : null,
      };
      if (tipo === 'receber') await api.financeiro.criarContaReceber(data);
      else await api.financeiro.criarContaPagar(data);
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{tipo === 'receber' ? 'Nova conta a receber' : 'Nova conta a pagar'}</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="block text-sm mb-1">Descricao</label><input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} required className="input" /></div>
          <div><label className="block text-sm mb-1">Valor (R$)</label><input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(parseFloat(e.target.value) || 0)} required className="input" /></div>
          <div><label className="block text-sm mb-1">Vencimento</label><input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} required className="input" /></div>
          {tipo === 'receber' && (
            <div><label className="block text-sm mb-1">Cliente</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} required className="input">
                <option value="">Selecione</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          {tipo === 'pagar' && podePagar && (
            <div><label className="block text-sm mb-1">Fornecedor</label>
              <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} required className="input">
                <option value="">Selecione</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
              </select>
            </div>
          )}
          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white py-2 rounded">{salvando ? 'Salvando...' : 'Criar'}</button>
        </form>
      </div>
    </div>
  );
}
