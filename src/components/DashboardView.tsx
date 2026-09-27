import React, { useState, useMemo, useEffect } from 'react';
import { ProductItem, RecentSale } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface DashboardViewProps {
  products: ProductItem[];
  recentSales: RecentSale[];
  onSelectProductForSale: (product: ProductItem) => void;
  onNavigateToPDV: () => void;
  onNavigateToFinanceiro: () => void;
  onNavigateToEstoque?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomHourlyTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const hourNum = parseInt(label?.split(':')[0] || '0', 10);
  const nextHour = `${String(hourNum + 1).padStart(2, '0')}:00`;

  return (
    <div className="bg-[#001229] text-white p-3.5 rounded-xl shadow-2xl border border-[#57dffe]/40 text-xs min-w-[240px] space-y-2 pointer-events-none">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 font-bold text-[#57dffe]">
          <span className="material-symbols-outlined text-sm">schedule</span>
          <span>{label} às {nextHour}</span>
        </div>
        {point.isPeak ? (
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px] uppercase tracking-wide">
            Pico do Dia
          </span>
        ) : point.isCurrent ? (
          <span className="px-2 py-0.5 rounded-full bg-[#57dffe] text-[#001229] font-bold text-[10px] uppercase tracking-wide">
            Hora Atual
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[#a6c8ff]">Faturamento Hora:</span>
          <span className="font-mono font-bold text-base text-white">
            R$ {point.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Tíquetes Emitidos:</span>
          <span className="font-mono font-bold text-[#57dffe]">
            {point.pedidos} {point.pedidos === 1 ? 'venda' : 'vendas'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Tíquete Médio:</span>
          <span className="font-mono text-white">
            R$ {(point.faturamento / Math.max(1, point.pedidos)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px]">
          <span className="text-[#74777e]">Fluxo Acumulado no Caixa:</span>
          <span className="font-mono font-bold text-[#22d3ee]">
            R$ {point.acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  recentSales,
  onSelectProductForSale,
  onNavigateToPDV,
  onNavigateToFinanceiro,
  onNavigateToEstoque,
}) => {
  const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes'>('hoje');
  const [chartTab, setChartTab] = useState<'hourly' | 'weekly'>('hourly');
  const [hourlyMetricView, setHourlyMetricView] = useState<'faturamento' | 'acumulado' | 'pedidos'>('faturamento');
  const [filterBrand, setFilterBrand] = useState<string>('todos');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);

  // Synchronize period selector with chart tab
  useEffect(() => {
    if (period === 'hoje') {
      setChartTab('hourly');
    } else if (period === 'semana') {
      setChartTab('weekly');
    }
  }, [period]);

  // Baseline hourly sales distribution for current day (store hours 08:00 to 18:00)
  const baseHourlySales = useMemo(() => [
    { hora: '08:00', faturamento: 840, pedidos: 4, meta: 1000 },
    { hora: '09:00', faturamento: 1450, pedidos: 7, meta: 1200 },
    { hora: '10:00', faturamento: 2320, pedidos: 11, meta: 1600 },
    { hora: '11:00', faturamento: 3480, pedidos: 15, meta: 2000 }, // Peak Morning (Tinting pickups & contractors)
    { hora: '12:00', faturamento: 1120, pedidos: 5, meta: 1000 }, // Lunch break
    { hora: '13:00', faturamento: 1690, pedidos: 8, meta: 1400 },
    { hora: '14:00', faturamento: 2780, pedidos: 13, meta: 1800 },
    { hora: '15:00', faturamento: 3150, pedidos: 14, meta: 2000 }, // Peak Afternoon (Body shops & finishing work)
    { hora: '16:00', faturamento: 1840, pedidos: 9, meta: 1600 },
    { hora: '17:00', faturamento: 950, pedidos: 5, meta: 1200 },
    { hora: '18:00', faturamento: 320, pedidos: 2, meta: 800 },
  ], []);

  // Compute live hourly sales merged with recentSales
  const hourlyData = useMemo(() => {
    const map = new Map<string, { faturamento: number; pedidos: number; meta: number }>();
    baseHourlySales.forEach(item => {
      map.set(item.hora, { faturamento: item.faturamento, pedidos: item.pedidos, meta: item.meta });
    });

    recentSales.forEach(sale => {
      if (sale.time) {
        const hourPart = sale.time.split(':')[0];
        const hourKey = `${hourPart.padStart(2, '0')}:00`;
        if (map.has(hourKey)) {
          const curr = map.get(hourKey)!;
          curr.faturamento += sale.amount;
          curr.pedidos += 1;
        }
      }
    });

    let maxFaturamento = 0;
    let peakHourKey = '11:00';
    map.forEach((val, key) => {
      if (val.faturamento > maxFaturamento) {
        maxFaturamento = val.faturamento;
        peakHourKey = key;
      }
    });

    const currentHourStr = `${String(new Date().getHours()).padStart(2, '0')}:00`;

    let runningTotal = 0;
    return baseHourlySales.map(item => {
      const entry = map.get(item.hora) || item;
      runningTotal += entry.faturamento;
      return {
        hora: item.hora,
        faturamento: entry.faturamento,
        pedidos: entry.pedidos,
        acumulado: runningTotal,
        meta: entry.meta,
        isPeak: item.hora === peakHourKey,
        isCurrent: item.hora === currentHourStr,
      };
    });
  }, [baseHourlySales, recentSales]);

  // Live statistical telemetry
  const hourlyStats = useMemo(() => {
    const totalRevenue = hourlyData.reduce((acc, h) => acc + h.faturamento, 0);
    const totalTickets = hourlyData.reduce((acc, h) => acc + h.pedidos, 0);
    const avgHourly = totalRevenue / Math.max(1, hourlyData.length);
    const avgTicket = totalRevenue / Math.max(1, totalTickets);
    const peak = hourlyData.reduce(
      (max, h) => (h.faturamento > max.faturamento ? h : max),
      hourlyData[0] || { hora: '11:00', faturamento: 0, pedidos: 0 }
    );

    const morningRevenue = hourlyData.slice(0, 4).reduce((acc, h) => acc + h.faturamento, 0);
    const lunchRevenue = hourlyData[4]?.faturamento || 0;
    const afternoonRevenue = hourlyData.slice(5, 9).reduce((acc, h) => acc + h.faturamento, 0);
    const eveningRevenue = hourlyData.slice(9).reduce((acc, h) => acc + h.faturamento, 0);

    return {
      totalRevenue,
      totalTickets,
      avgHourly,
      avgTicket,
      peak,
      morningRevenue,
      lunchRevenue,
      afternoonRevenue,
      eveningRevenue,
    };
  }, [hourlyData]);

  const filteredProducts = products.filter(p => {
    const matchesBrand = filterBrand === 'todos' || p.brand.toLowerCase() === filterBrand.toLowerCase();
    const matchesSearch = tableSearch === '' || 
      p.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
      p.colorName.toLowerCase().includes(tableSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(tableSearch.toLowerCase());
    return matchesBrand && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* TOP SECTION: System Performance Summary & KPI Row */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[18px] font-bold text-[#001229] flex items-center gap-2">
              Métricas de Venda & Movimentação de Estoque
            </h2>
            <p className="text-xs text-[#44474d]">
              Fechamento consolidado e telemetria da loja em tempo real
            </p>
          </div>

          {/* Period Switcher & Export */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#c4c6ce]/50 p-0.5 bg-white shadow-xs">
              <button
                onClick={() => setPeriod('hoje')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  period === 'hoje' ? 'bg-[#001229] text-white shadow-xs' : 'text-[#44474d] hover:text-[#001229]'
                }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setPeriod('semana')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  period === 'semana' ? 'bg-[#001229] text-white shadow-xs' : 'text-[#44474d] hover:text-[#001229]'
                }`}
              >
                Esta Semana
              </button>
              <button
                onClick={() => setPeriod('mes')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  period === 'mes' ? 'bg-[#001229] text-white shadow-xs' : 'text-[#44474d] hover:text-[#001229]'
                }`}
              >
                Mês Corrente
              </button>
            </div>

            <button
              onClick={onNavigateToFinanceiro}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c4c6ce]/50 rounded-lg text-xs font-semibold text-[#001229] hover:bg-[#f0f3ff] transition-colors shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">file_download</span>
              <span>Exportar DRE</span>
            </button>
          </div>
        </div>

        {/* 5 High-Density KPI Cards (Modern Bento Grid Pattern) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Vendas Hoje */}
          <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs relative overflow-hidden group hover:border-[#00687a] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider">
                Vendas Hoje
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#00687a]">
                <span className="material-symbols-outlined text-lg">payments</span>
              </div>
            </div>
            <div className="text-[22px] font-bold text-[#001229] tracking-tight font-mono">
              R$ {hourlyStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#00687a]">
                <span className="material-symbols-outlined text-sm font-bold">trending_up</span>
                <span>+18.4%</span>
                <span className="text-[#74777e] font-normal">vs ontem</span>
              </div>
              {/* Mini SVG Sparkline */}
              <svg className="w-16 h-5 stroke-[#00687a] fill-none stroke-[2]" viewBox="0 0 60 20">
                <path d="M 2 18 Q 15 15, 25 10 T 45 8 T 58 2" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Card 2: Faturamento Mensal */}
          <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs hover:border-[#00687a] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider">
                Faturamento Mensal
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#001229]">
                <span className="material-symbols-outlined text-lg">calendar_month</span>
              </div>
            </div>
            <div className="text-[22px] font-bold text-[#001229] tracking-tight font-mono">
              R$ 382.400,00
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#74777e] font-normal">Meta R$ 415.000</span>
                <span className="font-bold text-[#001229]">92% atingido</span>
              </div>
              <div className="w-full h-2 bg-[#dee8ff] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0f2744] via-[#00687a] to-[#57dffe] rounded-full"
                  style={{ width: '92%' }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Alertas de Estoque Baixo */}
          <div
            onClick={onNavigateToEstoque}
            className="bg-white p-4 rounded-xl border border-[#ba1a1a]/30 shadow-xs relative overflow-hidden group hover:border-[#ba1a1a] transition-all cursor-pointer"
            title="Clique para abrir a Gestão de Estoque e Reposição"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#ffdad6]/20 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-[#ba1a1a] font-bold uppercase tracking-wider">
                Estoque Crítico
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[11px] font-bold">
                Atenção
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[22px] font-bold text-[#001229] font-mono">
                {products.filter(p => (p.stock <= (p.minStock ?? 12)) || p.isCritical).length} itens
              </div>
              <span className="text-[11px] text-[#ba1a1a] font-semibold">repor agora ➔</span>
            </div>
            <div className="mt-2 text-xs text-[#44474d] truncate">
              {products.filter(p => (p.stock <= (p.minStock ?? 12)) || p.isCritical).slice(0, 2).map(p => p.name).join(', ') || 'Nenhum item em ruptura'}
            </div>
          </div>

          {/* Card 4: Volume Vendido Hoje */}
          <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs hover:border-[#00687a] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider">
                Volume Hoje
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#0f2744]">
                <span className="material-symbols-outlined text-lg">format_paint</span>
              </div>
            </div>
            <div className="text-[22px] font-bold text-[#001229] font-mono">
              142 <span className="text-xs text-[#44474d] font-normal font-sans">unidades</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[#44474d]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#00687a]"></span>
              <span>86 latas 18L</span>
              <span className="text-[#74777e]">•</span>
              <span>56 galões 3.6L</span>
            </div>
          </div>

          {/* Card 5: Novos Clientes Cadastrados */}
          <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs hover:border-[#00687a] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#44474d] uppercase tracking-wider">
                Novos Clientes
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#00687a]">
                <span className="material-symbols-outlined text-lg">person_add</span>
              </div>
            </div>
            <div className="text-[22px] font-bold text-[#001229] font-mono">
              24 <span className="text-xs text-[#44474d] font-normal font-sans">cadastros</span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#44474d]">
              <span className="px-1.5 py-0.5 rounded bg-[#dee8ff] text-[#001229] font-bold">
                16 Pintores Pro
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#dee8ff] text-[#001229] font-bold">
                8 Construtoras
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* MIDDLE SECTION: Chart Analytics (8 cols / ~66%) & Real-Time PDV Stream (4 cols / ~34%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Curve Section: Recharts Real-Time Hourly Sales Volume (Hoje) & Weekly Curve */}
        <section className="lg:col-span-8 bg-white rounded-xl border border-[#c4c6ce]/40 p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header: Mode Selector & Telemetry Indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3 border-b border-[#c4c6ce]/30 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-bold text-[#001229]">
                    {chartTab === 'hourly' ? 'Volume de Vendas por Hora — Hoje' : 'Curva de Faturamento Semanal'}
                  </h3>
                  {chartTab === 'hourly' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#acedff] text-[#004e5c]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00687a] animate-pulse"></span>
                      Fluxo em Tempo Real
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#44474d] mt-0.5">
                  {chartTab === 'hourly'
                    ? 'Acompanhamento hora a hora do fluxo de caixa e volume de pedidos no PDV'
                    : 'Desempenho diário consolidado com distribuição por família de produtos'}
                </p>
              </div>

              {/* View Switcher: Hourly vs Weekly */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <div className="inline-flex rounded-lg border border-[#c4c6ce]/50 p-0.5 bg-[#f0f3ff]/60 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setChartTab('hourly')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                      chartTab === 'hourly'
                        ? 'bg-[#001229] text-white shadow-xs'
                        : 'text-[#44474d] hover:text-[#001229] hover:bg-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>Vendas por Hora (Hoje)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTab('weekly')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                      chartTab === 'weekly'
                        ? 'bg-[#001229] text-white shadow-xs'
                        : 'text-[#44474d] hover:text-[#001229] hover:bg-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">calendar_view_week</span>
                    <span>Curva Semanal</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TAB 1: RECHARTS HOURLY SALES LINE CHART */}
            {chartTab === 'hourly' && (
              <div className="space-y-4">
                {/* Real-Time Live Telemetry Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-[#f0f3ff]/70 border border-[#dee8ff]">
                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Faturamento Hoje
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      R$ {hourlyStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider flex items-center gap-1">
                      <span>Pico do Dia</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    </div>
                    <div className="text-base font-mono font-bold text-[#00687a]">
                      {hourlyStats.peak.hora}{' '}
                      <span className="text-[11px] font-normal text-[#44474d]">
                        (R$ {hourlyStats.peak.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })})
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Média por Hora
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      R$ {hourlyStats.avgHourly.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Tíquetes / Média
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      {hourlyStats.totalTickets} <span className="text-[11px] font-normal text-[#44474d]">notas</span>{' '}
                      <span className="text-xs text-[#00687a] font-normal">
                        (R$ {hourlyStats.avgTicket.toFixed(0)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metric Selector Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#74777e] text-[11px] font-medium">Exibir no gráfico:</span>
                    <button
                      type="button"
                      onClick={() => setHourlyMetricView('faturamento')}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        hourlyMetricView === 'faturamento'
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      💰 Faturamento por Hora (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHourlyMetricView('acumulado')}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        hourlyMetricView === 'acumulado'
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      📈 Faturamento + Caixa Acumulado
                    </button>
                    <button
                      type="button"
                      onClick={() => setHourlyMetricView('pedidos')}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        hourlyMetricView === 'pedidos'
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      🧾 Volume de Tíquetes / Pedidos
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#74777e]">
                    <span className="inline-block w-2.5 h-0.5 bg-[#ba1a1a]"></span>
                    <span>Linha Vermelha: Média Horária</span>
                  </div>
                </div>

                {/* Recharts Container */}
                <div className="w-full h-72 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                      <XAxis
                        dataKey="hora"
                        stroke="#74777e"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#c4c6ce' }}
                      />
                      <YAxis
                        yAxisId="revenue"
                        stroke="#74777e"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val: number) => `R$ ${(val / 1000).toFixed(val >= 1000 ? 1 : 0)}k`}
                      />
                      {hourlyMetricView === 'pedidos' && (
                        <YAxis
                          yAxisId="tickets"
                          orientation="right"
                          stroke="#0f2744"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => `${v} un`}
                        />
                      )}
                      <Tooltip content={<CustomHourlyTooltip />} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: 6, fontSize: '11px' }}
                        iconType="circle"
                      />
                      <ReferenceLine
                        yAxisId="revenue"
                        y={hourlyStats.avgHourly}
                        stroke="#ba1a1a"
                        strokeDasharray="4 4"
                        label={{
                          value: `Média R$ ${(hourlyStats.avgHourly / 1000).toFixed(1)}k`,
                          fill: '#ba1a1a',
                          fontSize: 10,
                          position: 'insideTopLeft',
                        }}
                      />
                      {/* Main Line: Faturamento por Hora */}
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="faturamento"
                        name="Faturamento por Hora (R$)"
                        stroke="#00687a"
                        strokeWidth={3}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          if (!cx || !cy) return <circle key={`dot-empty-${Math.random()}`} />;
                          if (payload.isPeak) {
                            return (
                              <g key={`peak-${payload.hora}`}>
                                <circle cx={cx} cy={cy} r={6} fill="#f59e0b" stroke="#ffffff" strokeWidth={2} />
                                <circle cx={cx} cy={cy} r={9} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.6} />
                              </g>
                            );
                          }
                          return (
                            <circle
                              key={`dot-${payload.hora}`}
                              cx={cx}
                              cy={cy}
                              r={3.5}
                              fill="#ffffff"
                              stroke="#00687a"
                              strokeWidth={2}
                            />
                          );
                        }}
                        activeDot={{ r: 7, stroke: '#001229', strokeWidth: 2, fill: '#57dffe' }}
                      />

                      {/* Cumulative Cash Flow Line */}
                      {hourlyMetricView === 'acumulado' && (
                        <Line
                          yAxisId="revenue"
                          type="monotone"
                          dataKey="acumulado"
                          name="Caixa Acumulado (R$)"
                          stroke="#57dffe"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      )}

                      {/* Ticket Volume Line */}
                      {hourlyMetricView === 'pedidos' && (
                        <Line
                          yAxisId="tickets"
                          type="monotone"
                          dataKey="pedidos"
                          name="Qtd de Tíquetes"
                          stroke="#0f2744"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: '#0f2744' }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Day Intervals Breakdown Footer */}
                <div className="pt-3 border-t border-[#c4c6ce]/30 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#f0f3ff]/40 border border-[#dee8ff]">
                    <div className="flex items-center justify-between text-[#74777e]">
                      <span>🌅 Manhã (08h-12h)</span>
                      <span className="font-bold text-[#00687a]">
                        {((hourlyStats.morningRevenue / Math.max(1, hourlyStats.totalRevenue)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="font-mono font-bold text-[#001229] mt-1 text-sm">
                      R$ {hourlyStats.morningRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e]">Retirada de tintas & obras</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f0f3ff]/40 border border-[#dee8ff]">
                    <div className="flex items-center justify-between text-[#74777e]">
                      <span>🍽️ Almoço (12h-13h)</span>
                      <span className="font-bold text-[#00687a]">
                        {((hourlyStats.lunchRevenue / Math.max(1, hourlyStats.totalRevenue)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="font-mono font-bold text-[#001229] mt-1 text-sm">
                      R$ {hourlyStats.lunchRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e]">Giro estável de balcão</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f0f3ff]/40 border border-[#dee8ff]">
                    <div className="flex items-center justify-between text-[#74777e]">
                      <span>☀️ Tarde (13h-17h)</span>
                      <span className="font-bold text-[#00687a]">
                        {((hourlyStats.afternoonRevenue / Math.max(1, hourlyStats.totalRevenue)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="font-mono font-bold text-[#001229] mt-1 text-sm">
                      R$ {hourlyStats.afternoonRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e]">Funilaria & complementos</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f0f3ff]/40 border border-[#dee8ff]">
                    <div className="flex items-center justify-between text-[#74777e]">
                      <span>🌆 Fechamento (17h-18h)</span>
                      <span className="font-bold text-[#00687a]">
                        {((hourlyStats.eveningRevenue / Math.max(1, hourlyStats.totalRevenue)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="font-mono font-bold text-[#001229] mt-1 text-sm">
                      R$ {hourlyStats.eveningRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e]">Pedidos de reposição final</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WEEKLY CONSOLIDATED CURVE */}
            {chartTab === 'weekly' && (
              <div>
                <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0f2744]"></span>
                    <span className="text-[#44474d]">Acrílicas Premium</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00687a]"></span>
                    <span className="text-[#44474d]">Esmaltes & Madeiras</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#57dffe]"></span>
                    <span className="text-[#44474d]">Impermeabilizantes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#c4c6ce]"></span>
                    <span className="text-[#44474d]">Acessórios / Rolos</span>
                  </div>
                </div>

                {/* Stylized Weekly Chart Canvas */}
                <div className="relative h-64 w-full pt-4">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    <div className="border-b border-[#dee8ff] w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 25k</span>
                    </div>
                    <div className="border-b border-[#dee8ff] w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 20k</span>
                    </div>
                    <div className="border-b border-[#dee8ff] w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 15k</span>
                    </div>
                    <div className="border-b border-[#dee8ff] w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 10k</span>
                    </div>
                    <div className="border-b border-[#dee8ff] w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 5k</span>
                    </div>
                    <div className="border-b border-[#c4c6ce]/60 w-full flex justify-between">
                      <span className="text-[10px] font-mono text-[#74777e]">R$ 0</span>
                    </div>
                  </div>

                  <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 700 240">
                    <defs>
                      <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#57dffe" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#57dffe" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 40 180 C 130 150, 160 130, 230 110 C 310 90, 360 140, 440 80 C 510 30, 560 70, 660 35 L 660 230 L 40 230 Z"
                      fill="url(#areaGradient)"
                    />
                    <path
                      d="M 40 180 C 130 150, 160 130, 230 110 C 310 90, 360 140, 440 80 C 510 30, 560 70, 660 35"
                      fill="none"
                      stroke="#00687a"
                      strokeLinecap="round"
                      strokeWidth="3.5"
                    />
                    <circle cx="40" cy="180" fill="#ffffff" r="4.5" stroke="#00687a" strokeWidth="2.5" />
                    <circle cx="230" cy="110" fill="#ffffff" r="4.5" stroke="#00687a" strokeWidth="2.5" />
                    <circle cx="440" cy="80" fill="#ffffff" r="4.5" stroke="#00687a" strokeWidth="2.5" />
                    <circle cx="660" cy="35" fill="#57dffe" r="6" stroke="#0f2744" strokeWidth="3" />
                  </svg>

                  <div className="absolute right-6 top-2 bg-[#0f2744] text-white px-3 py-1.5 rounded-lg shadow-lg border border-[#57dffe]/40 pointer-events-none">
                    <div className="text-[10px] font-semibold text-[#57dffe]">Hoje (Consolidado)</div>
                    <div className="text-sm font-mono font-bold">
                      R$ {hourlyStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[9px] text-[#798fb1]">{hourlyStats.totalTickets} fórmulas batidas</div>
                  </div>

                  <div className="absolute -bottom-5 left-0 right-0 flex justify-between px-8 text-xs text-[#74777e]">
                    <span>Sex (18)</span>
                    <span>Sáb (19)</span>
                    <span>Seg (21)</span>
                    <span>Ter (22)</span>
                    <span>Qua (23)</span>
                    <span className="font-bold text-[#001229]">Hoje (24)</span>
                    <span className="text-[#c4c6ce]">Sex (Proj.)</span>
                  </div>
                </div>

                {/* Category Progress Breakdown Footer */}
                <div className="mt-8 pt-4 border-t border-[#c4c6ce]/30 grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#44474d] truncate">Acrílicas & Imob.</span>
                      <span className="font-mono font-bold text-[#001229]">45%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#dee8ff] rounded-full overflow-hidden">
                      <div className="h-full bg-[#0f2744] rounded-full" style={{ width: '45%' }} />
                    </div>
                    <div className="text-[11px] font-mono text-[#74777e]">R$ 172.080,00</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#44474d] truncate">Linha Automotiva</span>
                      <span className="font-mono font-bold text-red-600">22%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#dee8ff] rounded-full overflow-hidden">
                      <div className="h-full bg-red-600 rounded-full" style={{ width: '22%' }} />
                    </div>
                    <div className="text-[11px] font-mono text-[#74777e]">R$ 84.128,00</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#44474d] truncate">Funilaria / Compl.</span>
                      <span className="font-mono font-bold text-amber-600">14%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#dee8ff] rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '14%' }} />
                    </div>
                    <div className="text-[11px] font-mono text-[#74777e]">R$ 53.536,00</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#44474d] truncate">Esmaltes & Vernizes</span>
                      <span className="font-mono font-bold text-[#00687a]">12%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#dee8ff] rounded-full overflow-hidden">
                      <div className="h-full bg-[#00687a] rounded-full" style={{ width: '12%' }} />
                    </div>
                    <div className="text-[11px] font-mono text-[#74777e]">R$ 45.888,00</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#44474d] truncate">Acessórios / Lixas</span>
                      <span className="font-mono font-bold text-[#74777e]">7%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#dee8ff] rounded-full overflow-hidden">
                      <div className="h-full bg-[#74777e] rounded-full" style={{ width: '7%' }} />
                    </div>
                    <div className="text-[11px] font-mono text-[#74777e]">R$ 26.768,00</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Real-Time PDV Stream & Cashier Activity */}
        <section className="lg:col-span-4 bg-white rounded-xl border border-[#c4c6ce]/40 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#c4c6ce]/30 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00687a]">receipt_long</span>
                <h3 className="text-[16px] font-bold text-[#001229]">Últimas Vendas PDV</h3>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-[#00687a] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#00687a] animate-pulse"></span>
                Ao vivo
              </span>
            </div>

            {/* Feed of Recent Closed Transactions */}
            <div className="space-y-2.5">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="p-2.5 rounded-lg border border-[#c4c6ce]/40 hover:bg-[#f0f3ff] transition-all cursor-pointer"
                  onClick={onNavigateToPDV}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${sale.paymentBadgeClass}`}>
                        {sale.paymentType}
                      </span>
                      <span className="text-xs font-bold text-[#001229] truncate max-w-[150px]">
                        {sale.clientName}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#001229]">
                      R$ {sale.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#44474d]">
                    <span className="truncate max-w-[170px]">{sale.itemsSummary}</span>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-[#74777e]">
                      <span>{sale.time}</span>
                      <span>•</span>
                      <span>{sale.operator}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Terminal Action Bar */}
          <div className="pt-3 border-t border-[#c4c6ce]/30 mt-3 flex items-center justify-between">
            <div className="text-[11px] text-[#44474d]">
              <span>Total de tíquetes emitidos hoje: </span>
              <span className="font-bold text-[#001229] font-mono">58 notas</span>
            </div>
            <button
              onClick={onNavigateToPDV}
              className="text-xs font-bold text-[#00687a] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Ver no Caixa</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </section>
      </div>

      {/* BOTTOM SECTION: High-Performance Products & Tint Formulas Table */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden">
        {/* Table Header & Filter Bar */}
        <div className="p-4 border-b border-[#c4c6ce]/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#001229]">
              <span className="material-symbols-outlined">leaderboard</span>
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-[#001229]">
                Ranking de Tintas & Produtos Mais Vendidos
              </h3>
              <p className="text-xs text-[#44474d]">
                Acompanhamento de giro de fórmulas, acabamentos e níveis de estoque de base
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filtrar por nome, cor ou acabamento..."
                className="pl-8 pr-3 py-1 text-xs bg-[#f0f3ff]/50 border border-[#c4c6ce]/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00687a] w-56 sm:w-64"
              />
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-sm text-[#74777e]">
                filter_list
              </span>
            </div>

            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[#c4c6ce]/50 text-[#44474d] hover:text-[#001229] hover:bg-[#f0f3ff] transition-colors cursor-pointer bg-white"
            >
              <option value="todos">Todos Fabricantes</option>
              <option value="Suvinil">Suvinil</option>
              <option value="Coral">Coral</option>
              <option value="Lukscolor">Lukscolor</option>
              <option value="Sparlack">Sparlack</option>
              <option value="PPG Automotive">PPG Automotive</option>
              <option value="Lazzuril / Sherwin-Williams">Lazzuril / Sherwin-Williams</option>
              <option value="Maxi Rubber">Maxi Rubber (Funilaria)</option>
              <option value="3M Automotive">3M Automotive</option>
              <option value="MarquesColor Pro">MarquesColor Pro</option>
            </select>
          </div>
        </div>

        {/* High-Density Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff]/60 border-b border-[#c4c6ce]/40 text-[11px] text-[#74777e] uppercase tracking-wider h-9">
                <th className="py-2 px-4 font-bold">Cor / Acabamento</th>
                <th className="py-2 px-4 font-bold">Produto & Descrição Técnica</th>
                <th className="py-2 px-4 font-bold">SKU / Fórm. Tintométrica</th>
                <th className="py-2 px-4 font-bold">Fabricante</th>
                <th className="py-2 px-4 font-bold text-center">Nível de Brilho</th>
                <th className="py-2 px-4 font-bold text-right">Volume Hoje</th>
                <th className="py-2 px-4 font-bold text-right">Estoque Restante</th>
                <th className="py-2 px-4 font-bold text-right">Faturamento Total</th>
                <th className="py-2 px-4 font-bold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6ce]/20 text-xs">
              {filteredProducts.slice((page - 1) * 5, page * 5).map((prod) => (
                <tr
                  key={prod.id}
                  className={`hover:bg-[#f0f3ff]/40 transition-colors h-12 ${prod.isCritical ? 'bg-[#ffdad6]/10' : ''}`}
                >
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-md shadow-inner flex items-center justify-center border border-black/10 shrink-0"
                        style={{ backgroundColor: prod.swatchHex }}
                      >
                        {prod.swatchDot && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: prod.swatchDot }}
                          />
                        )}
                      </div>
                      <span className="font-bold text-[#001229] whitespace-nowrap">
                        {prod.colorName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <div className="font-bold text-[#001229]">{prod.name}</div>
                    <div className="text-[11px] text-[#74777e]">{prod.description}</div>
                  </td>
                  <td className="py-2 px-4 font-mono text-[#44474d]">
                    <span className="bg-[#f0f3ff] px-1.5 py-0.5 rounded text-[11px] border border-[#c4c6ce]/40">
                      {prod.sku}
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <span className="font-semibold text-[#001229]">{prod.brand}</span>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#dee8ff] text-[#001229] inline-flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: prod.glossDotColor }}
                      />
                      {prod.finish} ({prod.glossPercent})
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-[#001229]">
                    {prod.volumeToday} {prod.volumeUnit}
                  </td>
                  <td className={`py-2 px-4 text-right font-mono font-bold ${prod.isCritical ? 'text-[#ba1a1a]' : 'text-[#001229]'}`}>
                    {prod.stock} {prod.stockUnit}
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-[#001229]">
                    R$ {prod.salesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button
                      onClick={() => onSelectProductForSale(prod)}
                      className="px-2.5 py-1 rounded bg-[#0f2744] hover:bg-[#00687a] text-white text-[11px] font-bold transition-all active:scale-95 shadow-xs cursor-pointer flex items-center gap-1 mx-auto"
                      title="Adicionar ao Carrinho PDV"
                    >
                      <span className="material-symbols-outlined text-xs">add_shopping_cart</span>
                      <span>Vender</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination & Action Footer */}
        <div className="px-4 py-3 bg-[#f0f3ff]/30 border-t border-[#c4c6ce]/30 flex flex-col sm:flex-row items-center justify-between text-xs text-[#44474d] gap-2">
          <div>
            Exibindo <span className="font-bold text-[#001229]">{filteredProducts.length > 0 ? Math.min(page * 5, filteredProducts.length) - (page - 1) * 5 : 0}</span> (página {page} de {Math.max(1, Math.ceil(filteredProducts.length / 5))}) de{' '}
            <span className="font-bold text-[#001229]">{filteredProducts.length}</span> produtos no catálogo
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded border border-[#c4c6ce]/60 text-[#74777e] hover:text-[#001229] hover:bg-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            {Array.from({ length: Math.ceil(filteredProducts.length / 5) }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                  page === pageNum
                    ? 'bg-[#001229] text-white'
                    : 'border border-[#c4c6ce]/60 hover:bg-white text-[#44474d]'
                }`}
              >
                {pageNum}
              </button>
            ))}
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 5 >= filteredProducts.length}
              className="px-2.5 py-1 rounded border border-[#c4c6ce]/60 text-[#001229] hover:bg-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              Próximo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
