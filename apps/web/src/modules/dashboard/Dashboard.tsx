import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, ShoppingCart, PackageSearch, Boxes, TrendingUp, Wallet, History, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { usuario } = useAuth();
  const [metricas, setMetricas] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const [m, h] = await Promise.all([api.dashboard.metricas(), api.health()]);
      setMetricas(m);
      setHealth(h);
    } catch {
      setMetricas(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const atalhos = [
    { to: '/pdv', label: 'Nova Venda', icon: ShoppingCart, color: 'bg-azul', desc: 'Abre o PDV' },
    { to: '/produtos', label: 'Cadastrar Produto', icon: PackageSearch, color: 'bg-verde', desc: 'Itens do catalogo' },
    { to: '/estoque', label: 'Consultar Estoque', icon: Boxes, color: 'bg-amarelo', desc: 'Saldos e movimentacoes' },
    { to: '/vendas', label: 'Ver Vendas', icon: TrendingUp, color: 'bg-laranja', desc: 'Historico de vendas' },
  ];

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-azul animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Bem-vindo, <strong>{usuario?.nome}</strong> · Perfil: {usuario?.papel}
        </p>
      </div>

      {/* Status do sistema */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${health?.ok ? 'border-verde' : 'border-vermelho'}`}>
          <p className="font-semibold text-gray-800">API Marquescollor Tintas</p>
          <p className="text-sm text-gray-500">
            {health?.ok ? 'Respondendo normalmente' : 'Sem resposta'}
          </p>
        </div>
        <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${health?.banco ? 'border-verde' : 'border-vermelho'}`}>
          <p className="font-semibold text-gray-800">Banco de dados</p>
          <p className="text-sm text-gray-500">
            {health?.banco ? 'SQLite conectado' : 'Indisponivel'}
          </p>
        </div>
      </div>

      {/* Metricas reais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <CardMetrica label="Vendido hoje" valor={formatarCentavos(metricas?.totalVendidoHoje || 0)} cor="verde" />
        <CardMetrica label="Nº vendas hoje" valor={String(metricas?.numVendasHoje || 0)} cor="azul" />
        <CardMetrica label="Valor em caixa" valor={formatarCentavos(metricas?.valorEmCaixa || 0)} cor="amarelo" />
        <CardMetrica label="Estoque baixo" valor={`${metricas?.estoqueBaixo || 0} itens`} cor={metricas?.estoqueBaixo > 0 ? 'vermelho' : 'azul'} />
      </div>

      {/* Avisos */}
      {metricas && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {!metricas.caixaAberto && (
            <Link to="/caixa" className="bg-amarelo/10 border-l-4 border-amarelo p-4 rounded shadow hover:bg-amber-50">
              <p className="font-semibold text-amarelo flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Caixa fechado</p>
              <p className="text-xs text-gray-700 mt-1">Abra o caixa para poder vender.</p>
            </Link>
          )}
          {metricas.vendasPendentes > 0 && (
            <Link to="/vendas" className="bg-laranja/10 border-l-4 border-laranja p-4 rounded shadow">
              <p className="font-semibold text-laranja">{metricas.vendasPendentes} venda(s) pendente(s)</p>
              <p className="text-xs text-gray-700 mt-1">Vendas em rascunho.</p>
            </Link>
          )}
          {metricas.estoqueBaixo > 0 && (
            <Link to="/estoque?status=baixo" className="bg-vermelho/10 border-l-4 border-vermelho p-4 rounded shadow">
              <p className="font-semibold text-vermelho">{metricas.estoqueBaixo} produto(s) com estoque baixo</p>
              <p className="text-xs text-gray-700 mt-1">Verifique o estoque.</p>
            </Link>
          )}
        </div>
      )}

      {/* Atalhos */}
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Atalhos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {atalhos.map(a => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="bg-white rounded-lg shadow p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow"
            >
              <div className={`w-12 h-12 rounded-full ${a.color} flex items-center justify-center mb-3`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="font-medium text-gray-800">{a.label}</p>
              <p className="text-xs text-gray-400 mt-1">{a.desc}</p>
            </Link>
          );
        })}
      </div>

      {/* Ultimas vendas */}
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Ultimas 5 vendas</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {metricas?.ultimasVendas?.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {metricas.ultimasVendas.map((v: any) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">#{v.numero}</td>
                  <td className="px-4 py-3 text-xs">{formatarDataHora(v.criadoEm)}</td>
                  <td className="px-4 py-3">{v.clienteNome}</td>
                  <td className="px-4 py-3 text-right font-medium text-verde">{formatarCentavos(v.totalCentavos)}</td>
                  <td className="px-4 py-3">
                    <span className={v.status === 'FINALIZADA' ? 'text-verde' : v.status === 'CANCELADA' ? 'text-vermelho' : 'text-gray-500'}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-center text-gray-500 py-8">Nenhuma venda registrada ainda.</p>
        )}
      </div>
    </div>
  );
}

function CardMetrica({ label, valor, cor }: { label: string; valor: string; cor: 'verde' | 'azul' | 'amarelo' | 'vermelho' }) {
  const corBorda = {
    verde: 'border-verde',
    azul: 'border-azul',
    amarelo: 'border-amarelo',
    vermelho: 'border-vermelho',
  }[cor];
  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${corBorda}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{valor}</p>
    </div>
  );
}
