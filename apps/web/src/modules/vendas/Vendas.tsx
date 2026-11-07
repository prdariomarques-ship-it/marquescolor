import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, Eye, Ban, FileSpreadsheet, FileDown, Filter } from 'lucide-react';
import { gerarArquivoXlsx } from '../../lib/contabilExport';
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
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [operadorId, setOperadorId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [operadores, setOperadores] = useState<Array<{ id: string; nome: string }>>([]);
  const [exportando, setExportando] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [modalCancelar, setModalCancelar] = useState<string | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    api.configuracoes.get().then(setConfig).catch(() => {});
    api.vendas.operadores().then(setOperadores).catch(() => {});
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
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (operadorId) params.operadorId = operadorId;
      if (formaPagamento) params.formaPagamento = formaPagamento;
      const res = await api.vendas.list(params);
      setVendas(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [filtroStatus, dataInicio, dataFim, operadorId, formaPagamento, page]);

  function aplicarPeriodo(valor: string) {
    setPeriodo(valor);
    const hoje = new Date();
    const montar = (data: Date) => {
      const ano = data.getFullYear();
      const mes = String(data.getMonth() + 1).padStart(2, '0');
      const dia = String(data.getDate()).padStart(2, '0');
      return `${ano}-${mes}-${dia}`;
    };
    if (valor === 'hoje') {
      setDataInicio(montar(hoje)); setDataFim(montar(hoje));
    } else if (valor === 'ontem') {
      const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
      setDataInicio(montar(ontem)); setDataFim(montar(ontem));
    } else if (valor === '7dias') {
      const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 6);
      setDataInicio(montar(inicio)); setDataFim(montar(hoje));
    } else if (valor === '30dias') {
      const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 29);
      setDataInicio(montar(inicio)); setDataFim(montar(hoje));
    } else if (valor === 'todos') {
      setDataInicio(''); setDataFim('');
    }
    setPage(1);
  }

  function parametrosExportacao() {
    const params: any = {};
    if (filtroStatus) params.status = filtroStatus;
    if (dataInicio) params.dataInicio = dataInicio;
    if (dataFim) params.dataFim = dataFim;
    if (operadorId) params.operadorId = operadorId;
    if (formaPagamento) params.formaPagamento = formaPagamento;
    return params;
  }

  async function exportar(formato: 'csv' | 'xlsx') {
    setExportando(true);
    try {
      const resultado = await api.vendas.exportar(parametrosExportacao());
      const registros = resultado.vendas || [];
      if (!registros.length) {
        alert('Não há vendas para exportar com os filtros atuais.');
        return;
      }
      if (resultado.limiteAplicado) {
        alert('A exportação atingiu o limite de 20.000 vendas. Restrinja o período para exportar o restante.');
      }
      const dataArquivo = new Date().toISOString().slice(0, 10);
      const nome = `marquescolor-vendas-${dataInicio || 'inicio'}-${dataFim || dataArquivo}`;
      const dinheiro = (centavos: number) => Number((Number(centavos || 0) / 100).toFixed(2));
      const vendasRows = [
        ['Número', 'Data e hora', 'Status', 'Cliente', 'Documento', 'Operador', 'Subtotal (R$)', 'Desconto (R$)', 'Acréscimo (R$)', 'Total (R$)', 'Formas de pagamento'],
        ...registros.map((v: any) => [
          v.numero, new Date(v.criadoEm).toLocaleString('pt-BR'), v.status,
          v.clienteNome || v.cliente?.nome || 'Anônima', v.clienteDocumento || v.cliente?.cpfCnpj || '',
          v.operadorNome || v.usuarioId, dinheiro(v.subtotalCentavos), dinheiro(v.descontoCentavos),
          dinheiro(v.acrescimoCentavos), dinheiro(v.totalCentavos),
          (v.pagamentos || []).map((p: any) => `${p.forma}: ${(dinheiro(p.valorCentavos)).toFixed(2)}`).join(' | '),
        ]),
      ];
      const itens = registros.flatMap((v: any) => (v.itens || []).map((item: any) => ({
        venda: v.numero, data: new Date(v.criadoEm).toLocaleString('pt-BR'), status: v.status,
        codigo: item.codigoSnapshot, produto: item.nomeProdutoSnapshot, quantidade: item.quantidade,
        preco: dinheiro(item.precoUnitarioCentavos), desconto: dinheiro(item.descontoItemCentavos),
        subtotal: dinheiro(item.subtotalCentavos),
      })));
      const itensRows = [
        ['Venda', 'Data e hora', 'Status', 'Código', 'Produto', 'Quantidade', 'Preço unitário (R$)', 'Desconto do item (R$)', 'Subtotal (R$)'],
        ...itens.map((i: any) => [i.venda, i.data, i.status, i.codigo, i.produto, i.quantidade, i.preco, i.desconto, i.subtotal]),
      ];
      const conciliacao = new Map<string, { quantidade: number; valor: number }>();
      registros.filter((v: any) => v.status === 'FINALIZADA').forEach((v: any) => {
        (v.pagamentos || []).forEach((p: any) => {
          const atual = conciliacao.get(p.forma) || { quantidade: 0, valor: 0 };
          atual.quantidade += 1;
          atual.valor += Number(p.valorCentavos || 0);
          conciliacao.set(p.forma, atual);
        });
      });
      const resumoRows = [
        ['Forma de pagamento', 'Quantidade de lançamentos', 'Total recebido (R$)'],
        ...Array.from(conciliacao.entries()).map(([forma, item]) => [forma, item.quantidade, dinheiro(item.valor)]),
        ['TOTAL', Array.from(conciliacao.values()).reduce((t, item) => t + item.quantidade, 0), dinheiro(Array.from(conciliacao.values()).reduce((t, item) => t + item.valor, 0))],
      ];
      if (formato === 'xlsx') {
        const blob = gerarArquivoXlsx([
          { name: '1_Vendas_Periodo', rows: vendasRows },
          { name: '2_Itens_Detalhados', rows: itensRows },
          { name: '3_Conciliacao', rows: resumoRows },
        ]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${nome}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const escapar = (valor: any) => {
          let texto = String(valor ?? '');
          if (/^[=+@-]/.test(texto)) texto = `'${texto}`;
          return `"${texto.replace(/"/g, '""')}"`;
        };
        const csvRows = [
          ['Venda', 'Data e hora', 'Status', 'Cliente', 'Documento', 'Operador', 'Forma(s) de pagamento', 'Código', 'Produto', 'Quantidade', 'Preço unitário (R$)', 'Desconto item (R$)', 'Subtotal item (R$)', 'Subtotal venda (R$)', 'Desconto venda (R$)', 'Acréscimo (R$)', 'Total venda (R$)'],
          ...registros.flatMap((v: any) => {
            const linhas = (v.itens?.length ? v.itens : [null]).map((item: any) => [
              v.numero, new Date(v.criadoEm).toLocaleString('pt-BR'), v.status, v.clienteNome || 'Anônima',
              v.clienteDocumento || '', v.operadorNome || v.usuarioId,
              (v.pagamentos || []).map((p: any) => `${p.forma}: ${dinheiro(p.valorCentavos).toFixed(2)}`).join(' | '),
              item?.codigoSnapshot || '', item?.nomeProdutoSnapshot || '', item?.quantidade ?? '',
              item ? dinheiro(item.precoUnitarioCentavos).toFixed(2) : '',
              item ? dinheiro(item.descontoItemCentavos).toFixed(2) : '',
              item ? dinheiro(item.subtotalCentavos).toFixed(2) : '',
              dinheiro(v.subtotalCentavos).toFixed(2), dinheiro(v.descontoCentavos).toFixed(2),
              dinheiro(v.acrescimoCentavos).toFixed(2), dinheiro(v.totalCentavos).toFixed(2),
            ]);
            return linhas;
          }),
        ];
        const csv = '\uFEFF' + csvRows.map(row => row.map(escapar).join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${nome}.csv`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      alert(e.message || 'Não foi possível exportar as vendas.');
    } finally {
      setExportando(false);
    }
  }

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

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-2 font-semibold text-slate-800 mb-3"><Filter className="w-4 h-4" /> Filtros e exportação contábil</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select value={periodo} onChange={e => aplicarPeriodo(e.target.value)} className="input">
            <option value="">Escolher período</option>
            <option value="hoje">Hoje</option><option value="ontem">Ontem</option>
            <option value="7dias">Últimos 7 dias</option><option value="30dias">Últimos 30 dias</option>
            <option value="todos">Todo o período</option>
          </select>
          <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPeriodo('personalizado'); setPage(1); }} className="input" aria-label="Data inicial" />
          <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPeriodo('personalizado'); setPage(1); }} className="input" aria-label="Data final" />
          <select value={operadorId} onChange={e => { setOperadorId(e.target.value); setPage(1); }} className="input">
            <option value="">Todos os operadores</option>
            {operadores.map(op => <option key={op.id} value={op.id}>{op.nome}</option>)}
          </select>
          <select value={formaPagamento} onChange={e => { setFormaPagamento(e.target.value); setPage(1); }} className="input">
            <option value="">Todas as formas</option>
            <option value="DINHEIRO">Dinheiro</option><option value="PIX">PIX</option>
            <option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option>
            <option value="TRANSFERENCIA">Transferência</option><option value="FIADO">Faturado / Fiado</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1); }} className="input max-w-xs">
            <option value="">Todos os status</option><option value="FINALIZADA">Finalizadas</option>
            <option value="CANCELADA">Canceladas</option><option value="RASCUNHO">Rascunho</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => exportar('csv')} disabled={exportando} className="bg-cyan-800 hover:bg-cyan-900 text-white px-3 py-2 rounded text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Exportar CSV
            </button>
            <button onClick={() => exportar('xlsx')} disabled={exportando} className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Exportar Excel
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">A exportação consulta o banco e inclui todos os registros do filtro, não apenas as 50 linhas exibidas na página. Excel contém abas de vendas, itens e conciliação por pagamento.</p>
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
