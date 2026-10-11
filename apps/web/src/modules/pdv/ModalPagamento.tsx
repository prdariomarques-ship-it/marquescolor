import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatarCentavos } from '../../lib/format';
import { Loader2, X, CreditCard, Banknote, Smartphone, Building, Wallet, Plus, Trash2 } from 'lucide-react';

interface ItemCarrinho {
  produto: any;
  quantidade: number;
  precoUnitarioCentavos: number;
  descontoCentavos: number;
}

interface Cliente {
  id: string;
  nome: string;
}

interface ModalPagamentoProps {
  itens: ItemCarrinho[];
  cliente: Cliente | null;
  descontoGeralCentavos: number;
  acrescimoCentavos: number;
  caixaId: string | null;
  onSucesso: (venda: any) => void;
  onCancelar: () => void;
}

const FORMAS = [
  { value: 'DINHEIRO', label: 'Dinheiro', icon: Banknote, cor: 'bg-verde' },
  { value: 'PIX', label: 'PIX', icon: Smartphone, cor: 'bg-azul' },
  { value: 'DEBITO', label: 'Debito', icon: CreditCard, cor: 'bg-amarelo' },
  { value: 'CREDITO', label: 'Credito', icon: CreditCard, cor: 'bg-laranja' },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: Building, cor: 'bg-verde' },
  { value: 'FIADO', label: 'Fiado', icon: Wallet, cor: 'bg-vermelho' },
];

export function ModalPagamento({ itens, cliente, descontoGeralCentavos, acrescimoCentavos, caixaId, onSucesso, onCancelar }: ModalPagamentoProps) {
  const subtotal = itens.reduce((acc, it) => acc + (it.precoUnitarioCentavos * it.quantidade - it.descontoCentavos), 0);
  const total = Math.max(0, subtotal - descontoGeralCentavos + acrescimoCentavos);

  const [pagamentos, setPagamentos] = useState<Array<{ forma: string; valorCentavos: number; parcelas: number; bandeira?: string }>>([]);
  const [formaAtual, setFormaAtual] = useState('DINHEIRO');
  const [valorAtual, setValorAtual] = useState(0);
  const [parcelas, setParcelas] = useState(1);
  const [valorRecebido, setValorRecebido] = useState(0);  // para troco em dinheiro
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const totalPago = pagamentos.reduce((acc, p) => acc + p.valorCentavos, 0);
  const restante = total - totalPago;
  const temFiado = pagamentos.some(p => p.forma === 'FIADO');
  const podeConfirmar = temFiado || totalPago >= total;

  function adicionarPagamento() {
    if (valorAtual <= 0) { setErro('Valor invalido'); return; }
    setPagamentos([...pagamentos, { forma: formaAtual, valorCentavos: Math.round(valorAtual * 100), parcelas, bandeira: formaAtual === 'CREDITO' || formaAtual === 'DEBITO' ? '' : undefined }]);
    setValorAtual(0);
    setParcelas(1);
    setErro(null);
  }

  function removerPagamento(idx: number) {
    setPagamentos(pagamentos.filter((_, i) => i !== idx));
  }

  function preencherRestante() {
    const r = (restante / 100);
    setValorAtual(parseFloat(r.toFixed(2)));
  }

  async function finalizar() {
    setSalvando(true); setErro(null);
    try {
      const payload = {
        clienteId: cliente?.id || null,
        itens: itens.map(it => ({
          produtoId: it.produto.id,
          quantidade: it.quantidade,
          precoUnitarioCentavos: it.precoUnitarioCentavos,
          descontoItemCentavos: it.descontoCentavos,
        })),
        pagamentos: pagamentos.map(p => ({
          forma: p.forma,
          valorCentavos: p.valorCentavos,
          parcelas: p.parcelas,
          bandeira: p.bandeira || null,
        })),
        descontoGeralCentavos,
        acrescimoCentavos,
        caixaId,
        valorRecebidoCentavos: Math.round(valorRecebido * 100),
      };
      const venda = await api.vendas.finalizar(payload);
      onSucesso(venda);
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  const troco = valorRecebido > 0 ? Math.max(0, (valorRecebido * 100) - total) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onCancelar}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">Finalizar venda</h2>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Resumo */}
          <div className="bg-gray-50 rounded p-3 text-sm">
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(subtotal)}</span></div>
            {descontoGeralCentavos > 0 && <div className="flex justify-between text-vermelho"><span>Desconto:</span><span>-{formatarCentavos(descontoGeralCentavos)}</span></div>}
            {acrescimoCentavos > 0 && <div className="flex justify-between text-verde"><span>Acrescimo:</span><span>+{formatarCentavos(acrescimoCentavos)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-azul border-t mt-1 pt-1"><span>TOTAL:</span><span>{formatarCentavos(total)}</span></div>
            {cliente && <p className="text-xs mt-1 text-gray-600">Cliente: {cliente.nome}</p>}
          </div>

          {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}

          {/* Pagamentos ja adicionados */}
          {pagamentos.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">Pagamentos</p>
              {pagamentos.map((p, i) => {
                const f = FORMAS.find(f => f.value === p.forma);
                return (
                  <div key={i} className="flex items-center justify-between bg-white border rounded p-2 text-sm">
                    <span>{f?.label} {p.parcelas > 1 ? `(${p.parcelas}x)` : ''}</span>
                    <span>{formatarCentavos(p.valorCentavos)}</span>
                    <button onClick={() => removerPagamento(i)} className="text-vermelho"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
              <p className="text-sm flex justify-between">
                <span>Total pago:</span>
                <span className="font-medium">{formatarCentavos(totalPago)}</span>
              </p>
              <p className="text-sm flex justify-between">
                <span>Restante:</span>
                <span className={`font-bold ${restante <= 0 ? 'text-verde' : 'text-vermelho'}`}>{restante > 0 ? formatarCentavos(restante) : 'Quitado'}</span>
              </p>
            </div>
          )}

          {/* Adicionar pagamento */}
          {restante > 0 && !temFiado && (
            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Adicionar pagamento</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {FORMAS.map(f => {
                  const Icon = f.icon;
                  const sel = formaAtual === f.value;
                  return (
                    <button key={f.value} onClick={() => setFormaAtual(f.value)} className={`flex flex-col items-center p-2 rounded border-2 ${sel ? 'border-azul bg-blue-50' : 'border-gray-200'}`}>
                      <Icon className={`w-5 h-5 ${f.cor} text-white p-0.5 rounded`} />
                      <span className="text-xs mt-1">{f.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Valor (R$)</label>
                  <div className="flex gap-1">
                    <input type="number" step="0.01" min="0" value={valorAtual} onChange={e => setValorAtual(parseFloat(e.target.value) || 0)} className="input" />
                    <button onClick={preencherRestante} className="text-xs bg-azul hover:bg-blue-700 text-white px-2 rounded" title="Preencher restante">R</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Parcelas</label>
                  <input type="number" min="1" max="12" value={parcelas} onChange={e => setParcelas(parseInt(e.target.value) || 1)} disabled={formaAtual !== 'CREDITO'} className="input disabled:opacity-50" />
                </div>
              </div>
              <button onClick={adicionarPagamento} className="w-full mt-2 bg-verde hover:bg-green-700 text-white py-2 rounded flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>
          )}

          {/* Valor recebido (troco) */}
          {pagamentos.some(p => p.forma === 'DINHEIRO') && restante <= 0 && (
            <div className="border-t pt-3">
              <label className="text-sm font-medium text-gray-700">Valor recebido em dinheiro (para troco)</label>
              <input type="number" step="0.01" min="0" value={valorRecebido} onChange={e => setValorRecebido(parseFloat(e.target.value) || 0)} className="input" />
              {troco > 0 && <p className="text-verde font-medium mt-1">Troco: {formatarCentavos(troco)}</p>}
            </div>
          )}

          {/* Confirmar */}
          <button onClick={finalizar} disabled={!podeConfirmar || salvando || pagamentos.length === 0} className="w-full bg-verde hover:bg-green-700 text-white font-bold py-3 rounded disabled:opacity-50 flex items-center justify-center gap-2">
            {salvando ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {salvando ? 'Finalizando...' : `Confirmar venda — ${formatarCentavos(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
