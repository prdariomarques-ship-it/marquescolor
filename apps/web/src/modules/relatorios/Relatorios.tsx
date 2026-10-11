import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, FileText, TrendingUp, Package, Wallet } from 'lucide-react';

export default function Relatorios() {
  const { usuario } = useAuth();
  const podeVerLucro = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [aba, setAba] = useState<'vendas' | 'produtos' | 'pagamentos' | 'lucro' | 'estoque'>('vendas');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro(null); setDados(null);
    try {
      const params: any = {};
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      let r: any;
      switch (aba) {
        case 'vendas': r = await api.relatorios.vendas(params); break;
        case 'produtos': r = await api.relatorios.produtosMaisVendidos({ ...params, limite: 50 }); break;
        case 'pagamentos': r = await api.relatorios.formasPagamento(params); break;
        case 'lucro': r = await api.relatorios.lucro(params); break;
        case 'estoque': r = await api.relatorios.estoque(); break;
      }
      setDados(r);
    } catch (e: any) { setErro(e.message); }
    finally { setCarregando(false); }
  }

  function exportarCSV() {
    if (!dados) return;
    let csv = '';
    if (aba === 'vendas' && dados.vendas) {
      csv = 'numero,data,cliente,subtotal,desconto,total\n';
      dados.vendas.forEach((v: any) => {
        csv += `${v.numero},${new Date(v.data).toLocaleString('pt-BR')},"${v.cliente}",${v.subtotal},${v.desconto},${v.total}\n`;
      });
    } else if (aba === 'produtos' && dados.produtos) {
      csv = 'nome,codigo,quantidade,valor\n';
      dados.produtos.forEach((p: any) => {
        csv += `"${p.nome}",${p.codigo},${p.qtd},${p.valor}\n`;
      });
    } else if (aba === 'pagamentos' && dados.formas) {
      csv = 'forma,quantidade,valor\n';
      dados.formas.forEach((f: any) => { csv += `${f.forma},${f.count},${f.valor}\n`; });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${aba}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const temDatas = aba !== 'estoque';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Relatorios</h1>
      <p className="text-sm text-gray-500 mb-6">Filtre por periodo e exporte em CSV</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setAba('vendas')} className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${aba === 'vendas' ? 'bg-azul text-white' : 'bg-white border'}`}><TrendingUp className="w-4 h-4" /> Vendas</button>
        <button onClick={() => setAba('produtos')} className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${aba === 'produtos' ? 'bg-azul text-white' : 'bg-white border'}`}><Package className="w-4 h-4" /> Produtos</button>
        <button onClick={() => setAba('pagamentos')} className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${aba === 'pagamentos' ? 'bg-azul text-white' : 'bg-white border'}`}><Wallet className="w-4 h-4" /> Pagamentos</button>
        {podeVerLucro && <button onClick={() => setAba('lucro')} className={`px-3 py-1.5 rounded text-sm ${aba === 'lucro' ? 'bg-azul text-white' : 'bg-white border'}`}>Lucro</button>}
        <button onClick={() => setAba('estoque')} className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${aba === 'estoque' ? 'bg-azul text-white' : 'bg-white border'}`}><FileText className="w-4 h-4" /> Estoque</button>
      </div>

      {temDatas && (
        <div className="flex gap-2 mb-4">
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="input max-w-xs" />
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="input max-w-xs" />
          <button onClick={carregar} disabled={carregando} className="bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded">
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar'}
          </button>
        </div>
      )}

      {!temDatas && (
        <button onClick={carregar} disabled={carregando} className="bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded mb-4">
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar'}
        </button>
      )}

      {erro && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 mb-4">{erro}</div>}

      {dados && (
        <>
          <button onClick={exportarCSV} className="text-sm text-azul hover:underline mb-4">Exportar CSV</button>

          {aba === 'vendas' && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-verde/10 p-3 rounded text-center"><p className="text-xs text-gray-600">Total</p><p className="text-xl font-bold text-verde">{formatarCentavos(dados.resumo.total)}</p></div>
                <div className="bg-azul/10 p-3 rounded text-center"><p className="text-xs text-gray-600">Nº vendas</p><p className="text-xl font-bold text-azul">{dados.resumo.numVendas}</p></div>
                <div className="bg-amarelo/10 p-3 rounded text-center"><p className="text-xs text-gray-600">Descontos</p><p className="text-xl font-bold text-amarelo">{formatarCentavos(dados.resumo.totalDescontos)}</p></div>
                <div className="bg-laranja/10 p-3 rounded text-center"><p className="text-xs text-gray-600">Ticket medio</p><p className="text-xl font-bold text-laranja">{formatarCentavos(dados.resumo.ticketMedio)}</p></div>
              </div>
              <p className="text-sm">{dados.vendas.length} vendas no periodo</p>
            </div>
          )}

          {aba === 'produtos' && (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="text-left p-2">Codigo</th><th className="text-left p-2">Nome</th><th className="text-right p-2">Qtd</th><th className="text-right p-2">Valor</th></tr></thead>
                <tbody className="divide-y">
                  {dados.produtos?.map((p: any) => (
                    <tr key={p.id}><td className="p-2 font-mono text-xs">{p.codigo}</td><td className="p-2">{p.nome}</td><td className="p-2 text-right">{p.qtd}</td><td className="p-2 text-right">{formatarCentavos(p.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aba === 'pagamentos' && (
            <div className="bg-white rounded-lg shadow p-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="text-left p-2">Forma</th><th className="text-right p-2">Quantidade</th><th className="text-right p-2">Valor</th></tr></thead>
                <tbody className="divide-y">
                  {dados.formas?.map((f: any) => (
                    <tr key={f.forma}><td className="p-2">{f.forma}</td><td className="p-2 text-right">{f.count}</td><td className="p-2 text-right">{formatarCentavos(f.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aba === 'lucro' && (
            <div className="bg-white rounded-lg shadow p-4 grid grid-cols-4 gap-3">
              <div className="bg-verde/10 p-3 rounded text-center"><p className="text-xs">Receita</p><p className="text-xl font-bold text-verde">{formatarCentavos(dados.receita)}</p></div>
              <div className="bg-vermelho/10 p-3 rounded text-center"><p className="text-xs">Custo</p><p className="text-xl font-bold text-vermelho">{formatarCentavos(dados.custo)}</p></div>
              <div className="bg-azul/10 p-3 rounded text-center"><p className="text-xs">Lucro</p><p className="text-xl font-bold text-azul">{formatarCentavos(dados.lucro)}</p></div>
              <div className="bg-amarelo/10 p-3 rounded text-center"><p className="text-xs">Margem</p><p className="text-xl font-bold text-amarelo">{dados.margem}%</p></div>
            </div>
          )}

          {aba === 'estoque' && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-verde/10 p-3 rounded text-center"><p className="text-xs">Valor estoque (custo)</p><p className="text-xl font-bold text-verde">{formatarCentavos(dados.valorEstoqueCusto)}</p></div>
                <div className="bg-azul/10 p-3 rounded text-center"><p className="text-xs">Valor estoque (venda)</p><p className="text-xl font-bold text-azul">{formatarCentavos(dados.valorEstoqueVenda)}</p></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
