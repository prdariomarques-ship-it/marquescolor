import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarDataHora } from '../../lib/format';
import { Loader2, ShoppingCart, PackageSearch, Boxes, TrendingUp, Wallet, History, AlertTriangle, Target, Sparkles, Save } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { usuario } = useAuth();
  const [metricas, setMetricas] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [metaValor, setMetaValor] = useState('');
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [mensagemMeta, setMensagemMeta] = useState<string | null>(null);
  const podeEditarMeta = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const [m, h] = await Promise.all([api.dashboard.metricas(), api.health()]);
      setMetricas(m);
      setHealth(h);
      try {
        const dadosMeta = await api.dashboard.metas();
        setMeta(dadosMeta);
        setMetaValor(dadosMeta.metaMensal ? (dadosMeta.metaMensal.valorMetaCentavos / 100).toFixed(2) : '');
      } catch { setMeta(null); }
    } catch {
      setMetricas(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvarMeta(valorCentavos: number, cenario: 'conservador' | 'moderado' | 'arrojado' | 'manual') {
    if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
      setMensagemMeta('Informe uma meta válida maior que zero.');
      return;
    }
    setSalvandoMeta(true);
    setMensagemMeta(null);
    try {
      await api.dashboard.salvarMeta(valorCentavos, cenario);
      const atualizado = await api.dashboard.metas();
      setMeta(atualizado);
      setMetaValor((valorCentavos / 100).toFixed(2));
      setMensagemMeta('Meta salva no banco de dados.');
    } catch (e: any) {
      setMensagemMeta(e.message || 'Não foi possível salvar a meta.');
    } finally {
      setSalvandoMeta(false);
    }
  }

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

      {/* Meta mensal baseada nas vendas finalizadas do banco */}
      {meta && (
        <section className="bg-white rounded-lg shadow p-5 mb-6 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Target className="w-5 h-5 text-cyan-700" /> Meta de vendas do mês</h2>
              <p className="text-xs text-slate-500">Progresso calculado a partir das vendas finalizadas e metas salvas no banco.</p>
            </div>
            <span className="text-xs text-slate-500">{meta.competencia}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)] gap-6 items-center">
            <div className="flex flex-col items-center">
              {(() => {
                const atingimento = Number(meta.percentualAtingido || 0);
                const progresso = Math.min(100, Math.max(0, atingimento));
                const cor = atingimento < 50 ? '#BA1A1A' : atingimento < 80 ? '#D97706' : atingimento < 100 ? '#00687A' : '#166534';
                return (
                  <div className="w-full max-w-xs">
                    <svg viewBox="0 0 220 132" role="img" aria-label={`Meta atingida em ${atingimento.toLocaleString('pt-BR')} por cento`} className="w-full">
                      <path d="M 16 112 A 94 94 0 0 1 204 112" pathLength="100" fill="none" stroke="#E5E7EB" strokeWidth="17" strokeLinecap="round" />
                      <path d="M 16 112 A 94 94 0 0 1 204 112" pathLength="100" fill="none" stroke={cor} strokeWidth="17" strokeLinecap="round" strokeDasharray={`${progresso} 100`} />
                      <text x="110" y="91" textAnchor="middle" className="fill-slate-900" fontSize="27" fontWeight="700">{atingimento.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</text>
                      <text x="110" y="111" textAnchor="middle" className="fill-slate-500" fontSize="9">DA META MENSAL</text>
                    </svg>
                    <div className="grid grid-cols-2 gap-3 mt-1 text-center">
                      <div><p className="text-xs text-slate-500">Faturado no mês</p><p className="font-bold text-slate-900 tabular-nums">{formatarCentavos(meta.faturamentoMesCentavos)}</p></div>
                      <div><p className="text-xs text-slate-500">Falta para a meta</p><p className="font-bold text-slate-900 tabular-nums">{formatarCentavos(meta.restanteCentavos)}</p></div>
                    </div>
                    <p className="text-xs text-slate-500 text-center mt-2">Ritmo diário necessário: <strong>{formatarCentavos(meta.ritmoDiarioCentavos)}</strong> · {meta.diasRestantes} dias restantes</p>
                  </div>
                );
              })()}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> Sugestão inteligente</h3>
                  <p className="text-xs text-slate-500">Média ponderada dos seis últimos meses completos; tendência compara os três meses mais recentes com os três anteriores.</p>
                </div>
                <span className="text-xs text-slate-500">Tendência: {meta.crescimentoTendenciaPct > 0 ? '+' : ''}{meta.crescimentoTendenciaPct}%</span>
              </div>
              <div className="grid grid-cols-6 gap-2 h-24 items-end mb-4">
                {meta.historico.map((item: any) => {
                  const maximo = Math.max(1, ...meta.historico.map((x: any) => x.faturamentoCentavos));
                  const altura = Math.max(4, item.faturamentoCentavos / maximo * 100);
                  return <div key={item.competencia} className="min-w-0 flex flex-col items-center justify-end h-full" title={formatarCentavos(item.faturamentoCentavos)}>
                    <div className="w-full rounded-t bg-cyan-700/80" style={{ height: `${altura}%` }} />
                    <span className="text-[10px] text-slate-500 mt-1 capitalize">{item.mes}</span>
                  </div>;
                })}
              </div>
              <p className="text-xs text-slate-500 mb-3">Média ponderada: <strong>{formatarCentavos(meta.mediaPonderadaCentavos)}</strong></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  ['conservador', 'Conservadora', '5% acima da média'],
                  ['moderado', 'Tendência semestral', '+10% sobre a média'],
                  ['arrojado', 'Expansão', '18% acima da média'],
                ] as const).map(([key, label, descricao]) => (
                  <div key={key} className="border border-slate-200 rounded p-3">
                    <p className="text-xs font-semibold text-slate-700">{label}</p>
                    <p className="text-xs text-slate-500">{descricao}</p>
                    <p className="font-bold text-slate-900 tabular-nums mt-1">{formatarCentavos(meta.sugestoesCentavos[key])}</p>
                    {podeEditarMeta && <button onClick={() => salvarMeta(meta.sugestoesCentavos[key], key)} disabled={salvandoMeta || meta.sugestoesCentavos[key] <= 0} className="mt-2 text-xs font-semibold text-cyan-800 hover:underline disabled:opacity-40">Aceitar sugestão</button>}
                  </div>
                ))}
              </div>
              {podeEditarMeta && (
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 mt-3">
                  <label className="flex-1 min-w-[160px] text-xs text-slate-600">Definir meta manual (R$)
                    <input value={metaValor} onChange={e => setMetaValor(e.target.value)} type="number" min="0.01" step="0.01" className="input mt-1" placeholder="Ex.: 65000,00" />
                  </label>
                  <button onClick={() => salvarMeta(Math.round(Number(metaValor.replace(',', '.')) * 100), 'manual')} disabled={salvandoMeta || !Number.isFinite(Number(metaValor.replace(',', '.'))) || Number(metaValor.replace(',', '.')) <= 0} className="bg-azul hover:bg-blue-800 text-white px-3 py-2 rounded text-sm inline-flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Salvar meta</button>
                </div>
              )}
              {mensagemMeta && <p className="text-xs text-green-700 mt-2">{mensagemMeta}</p>}
              {meta.metaMensal && <p className="text-[11px] text-slate-400 mt-2">Meta atual: {formatarCentavos(meta.metaMensal.valorMetaCentavos)} · origem: {meta.metaMensal.origem}</p>}
            </div>
          </div>
        </section>
      )}

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
