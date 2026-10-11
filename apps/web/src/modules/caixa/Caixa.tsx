import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, Lock, Unlock, History, ArrowDown, ArrowUp, Minus } from 'lucide-react';

export default function Caixa() {
  const { usuario } = useAuth();
  const podeMovimentar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE' || usuario?.papel === 'CAIXA';
  const [status, setStatus] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalMovimentacao, setModalMovimentacao] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [verHistorico, setVerHistorico] = useState(false);

  async function carregarStatus() {
    setCarregando(true);
    try {
      const s = await api.caixa.status();
      setStatus(s);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  async function carregarHistorico() {
    try {
      const res = await api.caixa.historico({ pageSize: 20 });
      setHistorico(res.data);
    } catch (e: any) { alert(e.message); }
  }

  useEffect(() => { carregarStatus(); }, []);

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  const aberto = status?.aberto;
  const sessao = status?.sessao;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Caixa</h1>
      <p className="text-sm text-gray-500 mb-6">Controle de sessoes e movimentacoes de caixa</p>

      {/* Status atual */}
      <div className={`bg-white rounded-lg shadow p-6 mb-4 border-l-4 ${aberto ? 'border-verde' : 'border-vermelho'}`}>
        {aberto ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-verde font-bold flex items-center gap-1"><Unlock className="w-4 h-4" /> Caixa aberto</p>
                <p className="text-xs text-gray-500">Aberto em {formatarDataHora(sessao.abertoEm)}</p>
                <p className="text-xs text-gray-500">Valor abertura: {formatarCentavos(sessao.valorAberturaCentavos)}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-azul">{formatarCentavos(status.valorEsperadoCentavos || 0)}</p>
                <p className="text-xs text-gray-500">Saldo esperado</p>
              </div>
            </div>

            <div className="flex gap-2">
              {podeMovimentar && (
                <button onClick={() => setModalMovimentacao(true)} className="bg-amarelo hover:bg-yellow-600 text-gray-900 font-medium px-4 py-2 rounded">
                  Movimentacao
                </button>
              )}
              <button onClick={() => setModalFechar(true)} className="bg-vermelho hover:bg-red-700 text-white font-medium px-4 py-2 rounded flex items-center gap-1">
                <Lock className="w-4 h-4" /> Fechar caixa
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-vermelho font-bold flex items-center gap-1 mb-3"><Lock className="w-4 h-4" /> Nenhum caixa aberto</p>
            <p className="text-sm text-gray-600 mb-4">Voce precisa abrir um caixa antes de fazer vendas.</p>
            <button onClick={() => setModalAbrir(true)} className="bg-verde hover:bg-green-700 text-white font-medium px-4 py-2 rounded flex items-center gap-1">
              <Unlock className="w-4 h-4" /> Abrir caixa
            </button>
          </>
        )}
      </div>

      {/* Botao historico */}
      <button onClick={() => { carregarHistorico(); setVerHistorico(true); }} className="text-azul hover:underline text-sm">
        Ver historico de sessoes
      </button>

      {/* Modal Abrir */}
      {modalAbrir && (
        <ModalAbrir
          onSucesso={() => { setModalAbrir(false); carregarStatus(); }}
          onClose={() => setModalAbrir(false)}
        />
      )}

      {/* Modal Movimentacao */}
      {modalMovimentacao && sessao && (
        <ModalMovimentacao
          sessaoId={sessao.id}
          onSucesso={() => { setModalMovimentacao(false); carregarStatus(); }}
          onClose={() => setModalMovimentacao(false)}
        />
      )}

      {/* Modal Fechar */}
      {modalFechar && sessao && (
        <ModalFechar
          sessao={sessao}
          valorEsperado={status.valorEsperadoCentavos || 0}
          onSucesso={() => { setModalFechar(false); carregarStatus(); }}
          onClose={() => setModalFechar(false)}
        />
      )}

      {/* Modal historico */}
      {verHistorico && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setVerHistorico(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-bold">Historico de sessoes</h2>
              <button onClick={() => setVerHistorico(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Abertura</th><th className="text-right p-2">Inicial</th><th className="text-right p-2">Esperado</th><th className="text-right p-2">Diferenca</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody className="divide-y">
                {historico.map((s: any) => (
                  <tr key={s.id}>
                    <td className="p-2">{formatarDataHora(s.abertoEm)}</td>
                    <td className="p-2 text-right">{formatarCentavos(s.valorAberturaCentavos)}</td>
                    <td className="p-2 text-right">{s.valorFechamentoEsperadoCentavos ? formatarCentavos(s.valorFechamentoEsperadoCentavos) : '-'}</td>
                    <td className={`p-2 text-right ${(s.diferencaCentavos || 0) >= 0 ? 'text-verde' : 'text-vermelho'}`}>
                      {s.diferencaCentavos !== null ? formatarCentavos(s.diferencaCentavos) : '-'}
                    </td>
                    <td className="p-2">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalAbrir({ onSucesso, onClose }: { onSucesso: () => void; onClose: () => void }) {
  const [valor, setValor] = useState(0);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      await api.caixa.abrir({ valorAberturaCentavos: Math.round(valor * 100), observacao });
      onSucesso();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">Abrir caixa</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor de abertura (R$)</label>
            <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(parseFloat(e.target.value) || 0)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observacao (opcional)</label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} className="input" rows={2} />
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-verde hover:bg-green-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Abrindo...' : 'Abrir caixa'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ModalMovimentacao({ sessaoId, onSucesso, onClose }: { sessaoId: string; onSucesso: () => void; onClose: () => void }) {
  const [tipo, setTipo] = useState<'SANGRIA' | 'SUPRIMENTO' | 'DESPESA'>('SANGRIA');
  const [valor, setValor] = useState(0);
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (descricao.length < 3) { setErro('Descricao deve ter pelo menos 3 caracteres'); return; }
    setSalvando(true); setErro(null);
    try {
      await api.caixa.movimentacao(sessaoId, { tipo, valorCentavos: Math.round(valor * 100), descricao });
      onSucesso();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">Movimentacao de caixa</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as any)} className="input">
              <option value="SANGRIA">Sangria (retirada)</option>
              <option value="SUPRIMENTO">Suprimento (reposicao)</option>
              <option value="DESPESA">Despesa</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(parseFloat(e.target.value) || 0)} required className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} required className="input" rows={2} />
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Registrando...' : 'Registrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ModalFechar({ sessao, valorEsperado, onSucesso, onClose }: { sessao: any; valorEsperado: number; onSucesso: () => void; onClose: () => void }) {
  const [valorInformado, setValorInformado] = useState(valorEsperado / 100);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const diferenca = Math.round(valorInformado * 100) - valorEsperado;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      await api.caixa.fechar(sessao.id, {
        valorFechamentoInformadoCentavos: Math.round(valorInformado * 100),
        observacao,
      });
      onSucesso();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">Fechar caixa</h2>
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">{erro}</div>}
        <div className="bg-gray-50 p-3 rounded mb-3 text-sm">
          <p>Aberto em: {formatarDataHora(sessao.abertoEm)}</p>
          <p>Valor abertura: {formatarCentavos(sessao.valorAberturaCentavos)}</p>
          <p>Esperado: <strong>{formatarCentavos(valorEsperado)}</strong></p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor informado (R$)</label>
            <input type="number" step="0.01" min="0" value={valorInformado} onChange={e => setValorInformado(parseFloat(e.target.value) || 0)} required className="input" />
            <p className={`text-sm mt-1 ${diferenca >= 0 ? 'text-verde' : 'text-vermelho'}`}>
              Diferenca: {diferenca >= 0 ? '+' : ''}{formatarCentavos(diferenca)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observacao (opcional)</label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} className="input" rows={2} />
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-vermelho hover:bg-red-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Fechando...' : 'Confirmar fechamento'}
          </button>
        </form>
      </div>
    </div>
  );
}
