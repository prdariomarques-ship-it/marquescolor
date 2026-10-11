import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos } from '../../lib/format';
import { Search, Trash2, MinusCircle, PlusCircle, ShoppingCart, UserCircle, Percent, Loader2, X } from 'lucide-react';
import { ModalPagamento } from './ModalPagamento';
import { CupomNaoFiscal } from '../cupom/CupomNaoFiscal';

interface ProdutoBusca {
  id: string;
  codigoInterno: string;
  codigoBarras: string | null;
  nome: string;
  unidade: string;
  precoVendaCentavos: number;
  estoqueAtual: number;
  ativo: boolean;
  marca: { nome: string } | null;
}

interface ItemCarrinho {
  produto: ProdutoBusca;
  quantidade: number;
  precoUnitarioCentavos: number;
  descontoCentavos: number;  // desconto em centavos por item
}

interface ClienteSimplificado {
  id: string;
  nome: string;
  cpfCnpj: string | null;
}

export default function PDV() {
  const { usuario } = useAuth();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [mostraResultados, setMostraResultados] = useState(false);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [indiceItemAtivo, setIndiceItemAtivo] = useState<number | null>(null);
  const [cliente, setCliente] = useState<ClienteSimplificado | null>(null);
  const [modalCliente, setModalCliente] = useState(false);
  const [descontoGeralCentavos, setDescontoGeralCentavos] = useState(0);
  const [acrescimoCentavos, setAcrescimoCentavos] = useState(0);
  const [modalDescontoGeral, setModalDescontoGeral] = useState(false);
  const [modalDescontoItem, setModalDescontoItem] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [caixaId, setCaixaId] = useState<string | null>(null);
  const [vendaFinalizada, setVendaFinalizada] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verifica se ha caixa aberto
  useEffect(() => {
    api.caixa.status().then(res => {
      if (res.aberto) setCaixaId(res.sessao?.id || null);
    }).catch(() => {});
    api.configuracoes.get().then(setConfig).catch(() => {});
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // F2 — Nova venda
      if (e.key === 'F2') { e.preventDefault(); novaVenda(); }
      // F3 — alterar quantidade do item selecionado
      else if (e.key === 'F3') { e.preventDefault(); if (indiceItemAtivo !== null) alterarQtdItemAtivo(); }
      // F4 — desconto item
      else if (e.key === 'F4') { e.preventDefault(); if (indiceItemAtivo !== null) setModalDescontoItem(indiceItemAtivo); }
      // F5 — selecionar cliente
      else if (e.key === 'F5') { e.preventDefault(); setModalCliente(true); }
      // F6 — desconto geral / acrescimo
      else if (e.key === 'F6') { e.preventDefault(); setModalDescontoGeral(true); }
      // F10 — finalizar
      else if (e.key === 'F10') { e.preventDefault(); if (itens.length > 0) setModalPagamento(true); }
      // Esc — fechar modais
      else if (e.key === 'Escape') {
        setModalCliente(false);
        setModalDescontoGeral(false);
        setModalDescontoItem(null);
        setMostraResultados(false);
      }
      // Delete — remover item selecionado
      else if (e.key === 'Delete' && indiceItemAtivo !== null) {
        e.preventDefault();
        removerItem(indiceItemAtivo);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [indiceItemAtivo, itens]);

  // Foco automatico no campo de busca
  useEffect(() => { buscaRef.current?.focus(); }, []);

  // Debounce na busca
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!busca.trim()) { setResultados([]); setMostraResultados(false); return; }
    debounceRef.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await api.produtosBusca(busca);
        setResultados(res.data as ProdutoBusca[]);
        setMostraResultados(true);
      } catch (e) {
        console.error(e);
      } finally { setCarregando(false); }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  function novaVenda() {
    setItens([]);
    setCliente(null);
    setDescontoGeralCentavos(0);
    setAcrescimoCentavos(0);
    setIndiceItemAtivo(null);
    setBusca('');
    setVendaFinalizada(null);
    buscaRef.current?.focus();
  }

  function adicionarProduto(p: ProdutoBusca) {
    if (!p.ativo) { alert('Produto inativo'); return; }
    if (p.estoqueAtual <= 0) {
      if (!confirm(`Produto "${p.nome}" sem estoque. Continuar mesmo assim?`)) return;
    }
    const existente = itens.findIndex(i => i.produto.id === p.id);
    if (existente >= 0) {
      // Ja no carrinho — incrementa
      setItens(prev => prev.map((it, idx) => idx === existente ? { ...it, quantidade: it.quantidade + 1 } : it));
    } else {
      setItens(prev => [...prev, {
        produto: p,
        quantidade: 1,
        precoUnitarioCentavos: p.precoVendaCentavos,
        descontoCentavos: 0,
      }]);
    }
    setBusca('');
    setMostraResultados(false);
    buscaRef.current?.focus();
  }

  function alterarQtd(indice: number, delta: number) {
    setItens(prev => prev.map((it, i) => i === indice ? { ...it, quantidade: Math.max(0.001, it.quantidade + delta) } : it));
  }

  function alterarQtdItemAtivo() {
    if (indiceItemAtivo === null) return;
    const nova = parseFloat(prompt('Nova quantidade:', String(itens[indiceItemAtivo].quantidade)) || '0');
    if (!isNaN(nova) && nova > 0) {
      setItens(prev => prev.map((it, i) => i === indiceItemAtivo ? { ...it, quantidade: nova } : it));
    }
  }

  function removerItem(indice: number) {
    setItens(prev => prev.filter((_, i) => i !== indice));
    setIndiceItemAtivo(null);
  }

  function aplicarDescontoItem(indice: number, descontoCentavos: number) {
    setItens(prev => prev.map((it, i) => i === indice ? { ...it, descontoCentavos } : it));
    setModalDescontoItem(null);
  }

  // Calculos
  const subtotal = itens.reduce((acc, it) => acc + (it.precoUnitarioCentavos * it.quantidade - it.descontoCentavos), 0);
  const total = Math.max(0, subtotal - descontoGeralCentavos + acrescimoCentavos);

  return (
    <div className="h-full flex gap-4 max-w-7xl mx-auto">
      {/* Coluna esquerda — busca + resultados */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">PDV — Ponto de Venda</h2>
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={buscaRef}
              type="text"
              placeholder="Buscar por codigo, nome ou codigo de barras... (F2 = nova venda)"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onFocus={() => resultados.length > 0 && setMostraResultados(true)}
              className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-azul"
            />
            {carregando && <Loader2 className="w-5 h-5 text-azul animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          {mostraResultados && resultados.length > 0 && (
            <div className="mt-2 border rounded-lg max-h-80 overflow-y-auto">
              {resultados.map(p => (
                <button
                  key={p.id}
                  onClick={() => adicionarProduto(p)}
                  className="w-full text-left p-3 hover:bg-blue-50 border-b last:border-0 flex justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{p.nome}</p>
                    <p className="text-xs text-gray-500">{p.codigoInterno} {p.marca?.nome ? `· ${p.marca.nome}` : ''} · Est: {p.estoqueAtual} {p.unidade}</p>
                  </div>
                  <p className="text-verde font-bold">{formatarCentavos(p.precoVendaCentavos)}</p>
                </button>
              ))}
            </div>
          )}
          {mostraResultados && resultados.length === 0 && !carregando && (
            <p className="text-center text-gray-500 py-3 text-sm">Nenhum produto encontrado</p>
          )}
        </div>

        {/* Atalhos */}
        <div className="bg-white rounded-lg shadow p-3 text-xs text-gray-600">
          <strong>Atalhos:</strong> F2 Nova venda · F3 Qtd · F4 Desc. item · F5 Cliente · F6 Desc. geral · F10 Finalizar · Del Remover · Esc Fechar
        </div>
      </div>

      {/* Coluna direita — carrinho */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow p-4 max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Carrinho
            <span className="text-sm font-normal text-gray-500">({itens.length} itens)</span>
          </h2>
          <button onClick={novaVenda} className="text-sm bg-azul hover:bg-blue-700 text-white px-3 py-1.5 rounded">
            Nova venda (F2)
          </button>
        </div>

        {/* Cliente */}
        <div className="mb-3 p-2 bg-gray-50 rounded flex items-center justify-between">
          {cliente ? (
            <p className="text-sm"><UserCircle className="w-4 h-4 inline mr-1" />{cliente.nome} {cliente.cpfCnpj ? `· ${cliente.cpfCnpj}` : ''}</p>
          ) : (
            <p className="text-sm text-gray-500">Venda anonima (sem cliente)</p>
          )}
          <button onClick={() => setModalCliente(true)} className="text-xs text-azul hover:underline">
            {cliente ? 'Trocar' : 'Selecionar'} (F5)
          </button>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto border rounded">
          {itens.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Nenhum item adicionado</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2">Produto</th>
                  <th className="text-right px-2 py-2">Qtd</th>
                  <th className="text-right px-2 py-2">Unit</th>
                  <th className="text-right px-2 py-2">Desc</th>
                  <th className="text-right px-2 py-2">Subtotal</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {itens.map((it, idx) => {
                  const sub = it.precoUnitarioCentavos * it.quantidade - it.descontoCentavos;
                  const ativo = idx === indiceItemAtivo;
                  return (
                    <tr
                      key={it.produto.id}
                      onClick={() => setIndiceItemAtivo(idx)}
                      className={`cursor-pointer ${ativo ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-2 py-2">
                        <p className="font-medium text-gray-900">{it.produto.nome}</p>
                        <p className="text-xs text-gray-500">{it.produto.codigoInterno} · {it.produto.unidade}</p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={(e) => { e.stopPropagation(); alterarQtd(idx, -1); }} className="text-gray-400 hover:text-gray-700"><MinusCircle className="w-3 h-3 inline" /></button>
                        <span className="mx-1">{it.quantidade}</span>
                        <button onClick={(e) => { e.stopPropagation(); alterarQtd(idx, 1); }} className="text-gray-400 hover:text-gray-700"><PlusCircle className="w-3 h-3 inline" /></button>
                      </td>
                      <td className="px-2 py-2 text-right">{formatarCentavos(it.precoUnitarioCentavos)}</td>
                      <td className="px-2 py-2 text-right text-vermelho">{it.descontoCentavos > 0 ? `-${formatarCentavos(it.descontoCentavos)}` : '-'}</td>
                      <td className="px-2 py-2 text-right font-medium">{formatarCentavos(sub)}</td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={(e) => { e.stopPropagation(); removerItem(idx); }} className="text-vermelho hover:bg-red-100 p-1 rounded">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Totais */}
        <div className="mt-3 border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(subtotal)}</span></div>
          {descontoGeralCentavos > 0 && (
            <div className="flex justify-between text-vermelho"><span>Desconto geral:</span><span>-{formatarCentavos(descontoGeralCentavos)}</span></div>
          )}
          {acrescimoCentavos > 0 && (
            <div className="flex justify-between text-verde"><span>Acrescimo:</span><span>+{formatarCentavos(acrescimoCentavos)}</span></div>
          )}
          <div className="flex justify-between text-xl font-bold text-azul pt-2 border-t">
            <span>TOTAL:</span><span>{formatarCentavos(total)}</span>
          </div>
        </div>

        {/* Acoes */}
        <div className="mt-3 flex gap-2">
          <button onClick={() => setModalDescontoGeral(true)} className="flex-1 bg-amarelo hover:bg-yellow-600 text-gray-900 font-medium py-2 rounded flex items-center justify-center gap-1">
            <Percent className="w-4 h-4" /> Desconto (F6)
          </button>
          <button
            onClick={() => setModalPagamento(true)}
            disabled={itens.length === 0}
            className="flex-1 bg-verde hover:bg-green-700 text-white font-medium py-2 rounded disabled:opacity-50"
          >
            Finalizar (F10)
          </button>
        </div>
        {!caixaId && (
          <p className="mt-2 text-xs text-amarelo">Atencao: nenhum caixa aberto. Va em Caixa para abrir antes de vender.</p>
        )}
      </div>

      {/* Modal pagamento */}
      {modalPagamento && (
        <ModalPagamento
          itens={itens}
          cliente={cliente}
          descontoGeralCentavos={descontoGeralCentavos}
          acrescimoCentavos={acrescimoCentavos}
          caixaId={caixaId}
          onSucesso={(venda) => {
            setVendaFinalizada(venda);
            setModalPagamento(false);
            // Se imprimirAuto, dispara impressao automatica
            if (config?.imprimirAuto) {
              setTimeout(() => window.print(), 500);
            }
          }}
          onCancelar={() => setModalPagamento(false)}
        />
      )}

      {/* Cupom apos finalizar */}
      {vendaFinalizada && config && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setVendaFinalizada(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md max-h-[90vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-2">
              <h3 className="font-bold text-verde">Venda #{vendaFinalizada.numero} finalizada!</h3>
              <button onClick={() => { setVendaFinalizada(null); novaVenda(); }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="flex justify-center bg-white">
              <CupomNaoFiscal venda={vendaFinalizada} config={config} />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => window.print()} className="flex-1 bg-azul hover:bg-blue-700 text-white py-2 rounded">Imprimir cupom</button>
              <button onClick={() => { setVendaFinalizada(null); novaVenda(); }} className="flex-1 bg-verde hover:bg-green-700 text-white py-2 rounded">Nova venda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cliente */}
      {modalCliente && (
        <ModalSelecaoCliente
          clienteAtual={cliente}
          onSelecionar={(c) => { setCliente(c); setModalCliente(false); }}
          onLimpar={() => { setCliente(null); setModalCliente(false); }}
          onClose={() => setModalCliente(false)}
        />
      )}

      {/* Modal desconto geral */}
      {modalDescontoGeral && (
        <ModalDescontoGeral
          subtotal={subtotal}
          descontoAtual={descontoGeralCentavos}
          acrescimoAtual={acrescimoCentavos}
          onAplicar={(desc, acr) => { setDescontoGeralCentavos(desc); setAcrescimoCentavos(acr); setModalDescontoGeral(false); }}
          onClose={() => setModalDescontoGeral(false)}
        />
      )}

      {/* Modal desconto item */}
      {modalDescontoItem !== null && itens[modalDescontoItem] && (
        <ModalDescontoItem
          item={itens[modalDescontoItem]}
          onAplicar={(desc) => aplicarDescontoItem(modalDescontoItem, desc)}
          onClose={() => setModalDescontoItem(null)}
        />
      )}
    </div>
  );
}

function ModalSelecaoCliente({ clienteAtual, onSelecionar, onLimpar, onClose }: { clienteAtual: ClienteSimplificado | null; onSelecionar: (c: ClienteSimplificado) => void; onLimpar: () => void; onClose: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ClienteSimplificado[]>([]);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.clientes.list({ busca, pageSize: 10 });
        setResultados(res.data);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Selecionar cliente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <input type="text" placeholder="Buscar por nome, CPF..." value={busca} onChange={e => setBusca(e.target.value)} className="input mb-3" autoFocus />
        <div className="max-h-64 overflow-y-auto border rounded">
          {resultados.length === 0 ? (
            <p className="text-center text-gray-500 py-4 text-sm">Digite para buscar</p>
          ) : (
            resultados.map(c => (
              <button key={c.id} onClick={() => onSelecionar(c)} className="w-full text-left p-2 hover:bg-blue-50 border-b last:border-0">
                <p className="font-medium">{c.nome}</p>
                <p className="text-xs text-gray-500">{c.cpfCnpj || 'sem CPF'}</p>
              </button>
            ))
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={onLimpar} className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 rounded">Venda anonima</button>
          <button onClick={onClose} className="flex-1 bg-azul hover:bg-blue-700 text-white py-2 rounded">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDescontoGeral({ subtotal, descontoAtual, acrescimoAtual, onAplicar, onClose }: { subtotal: number; descontoAtual: number; acrescimoAtual: number; onAplicar: (desc: number, acr: number) => void; onClose: () => void }) {
  const [desconto, setDesconto] = useState(descontoAtual / 100);
  const [acrescimo, setAcrescimo] = useState(acrescimoAtual / 100);

  function aplicar() {
    const d = Math.max(0, Math.round(desconto * 100));
    const a = Math.max(0, Math.round(acrescimo * 100));
    if (d > subtotal) { alert('Desconto nao pode ser maior que subtotal'); return; }
    onAplicar(d, a);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Desconto geral / Acrescimo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-600 mb-3">Subtotal: <strong>{formatarCentavos(subtotal)}</strong></p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (R$)</label>
            <input type="number" step="0.01" min="0" value={desconto} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Acrescimo (R$)</label>
            <input type="number" step="0.01" min="0" value={acrescimo} onChange={e => setAcrescimo(parseFloat(e.target.value) || 0)} className="input" />
          </div>
        </div>
        <button onClick={aplicar} className="w-full mt-4 bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded">Aplicar</button>
      </div>
    </div>
  );
}

function ModalDescontoItem({ item, onAplicar, onClose }: { item: ItemCarrinho; onAplicar: (desc: number) => void; onClose: () => void }) {
  const [desconto, setDesconto] = useState(item.descontoCentavos / 100);
  const subtotalItem = item.precoUnitarioCentavos * item.quantidade;

  function aplicar() {
    const d = Math.max(0, Math.round(desconto * 100));
    if (d > subtotalItem) { alert('Desconto nao pode ser maior que o subtotal do item'); return; }
    onAplicar(d);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Desconto no item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <p className="font-medium text-gray-900">{item.produto.nome}</p>
        <p className="text-sm text-gray-600 mb-3">{item.quantidade} x {formatarCentavos(item.precoUnitarioCentavos)} = {formatarCentavos(subtotalItem)}</p>
        <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (R$)</label>
        <input type="number" step="0.01" min="0" value={desconto} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} className="input" />
        <button onClick={aplicar} className="w-full mt-4 bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded">Aplicar</button>
      </div>
    </div>
  );
}
