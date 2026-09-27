import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProductItem, RecentSale, CompletedSaleData } from '../types';
import { INITIAL_COMPLETED_SALES } from '../data/mockData';
import { useNotification } from '../context/NotificationContext';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
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
  completedSales?: CompletedSaleData[];
  onSelectProductForSale: (product: ProductItem) => void;
  onNavigateToPDV: () => void;
  onNavigateToFinanceiro: () => void;
  onNavigateToEstoque?: () => void;
  onNavigateToVendas?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomPeriodTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-[#001229] text-white p-3.5 rounded-xl shadow-2xl border border-[#57dffe]/40 text-xs min-w-[240px] space-y-2 pointer-events-none">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 font-bold text-[#57dffe]">
          <span className="material-symbols-outlined text-sm">calendar_month</span>
          <span>{point.dataCompleta || label}</span>
        </div>
        {point.isPeak ? (
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px] uppercase tracking-wide">
            Melhor Dia
          </span>
        ) : point.isToday ? (
          <span className="px-2 py-0.5 rounded-full bg-[#57dffe] text-[#001229] font-bold text-[10px] uppercase tracking-wide">
            Hoje
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[#a6c8ff]">Faturamento do Dia:</span>
          <span className="font-mono font-bold text-base text-white">
            R$ {point.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Pedidos Concluídos:</span>
          <span className="font-mono font-bold text-[#57dffe]">
            {point.pedidos} {point.pedidos === 1 ? 'venda' : 'vendas'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Ticket Médio:</span>
          <span className="font-mono text-white">
            R$ {point.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {point.descontos > 0 && (
          <div className="flex justify-between items-center text-amber-300">
            <span>Descontos Concedidos:</span>
            <span className="font-mono">
              -R$ {point.descontos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px]">
          <span className="text-[#74777e]">Acumulado na Semana:</span>
          <span className="font-mono font-bold text-[#22d3ee]">
            R$ {point.acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
};

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

const CustomCategoryTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-[#001229] text-white p-3.5 rounded-xl shadow-2xl border border-[#57dffe]/40 text-xs min-w-[270px] space-y-2 pointer-events-none">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold text-[#57dffe]">
          <span className="material-symbols-outlined text-base">{point.icon || 'bar_chart'}</span>
          <span className="text-sm">{point.categoria}</span>
        </div>
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white border border-white/20"
        >
          {point.participacao ? point.participacao.toFixed(1) : '0.0'}% do Total
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[#a6c8ff]">Vendas Totais (30d):</span>
          <span className="font-mono font-bold text-base text-white">
            R$ {point.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Volume Vendido:</span>
          <span className="font-mono font-bold text-[#57dffe]">
            {point.volume.toLocaleString('pt-BR')} {point.unidade || 'unidades'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[#c4c6ce]">
          <span>Ticket Médio por Venda:</span>
          <span className="font-mono text-white">
            R$ {point.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between items-center text-emerald-300">
          <span>Margem de Contribuição:</span>
          <span className="font-mono font-bold">
            {point.margem.toFixed(1)}%
          </span>
        </div>

        <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px]">
          <span className="text-[#74777e]">Principais Marcas:</span>
          <span className="font-medium text-amber-300 truncate max-w-[155px]">
            {point.marcas}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  recentSales,
  completedSales,
  onSelectProductForSale,
  onNavigateToPDV,
  onNavigateToFinanceiro,
  onNavigateToEstoque,
  onNavigateToVendas,
}) => {
  const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes'>('semana');
  const [chartTab, setChartTab] = useState<'periodo' | 'hourly' | 'categoria'>('periodo');
  const [hourlyMetricView, setHourlyMetricView] = useState<'faturamento' | 'acumulado' | 'pedidos'>('faturamento');
  const [periodMetricView, setPeriodMetricView] = useState<'faturamento' | 'acumulado' | 'pedidos' | 'ticket'>('faturamento');
  const [categoryMetricView, setCategoryMetricView] = useState<'faturamento' | 'volume' | 'margem' | 'ticket'>('faturamento');
  const [filterBrand, setFilterBrand] = useState<string>('todos');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);

  // Notification System Context for Toast Alerts
  const {
    triggerStockAlert,
    testStockAlert,
    toasts,
    allAlerts,
    soundEnabled,
    setSoundEnabled,
  } = useNotification();

  const [isAlertsBannerDismissed, setIsAlertsBannerDismissed] = useState(false);

  // Critical products list (stock <= minStock or isCritical flag)
  const criticalProducts = useMemo(() => {
    return products.filter(p => (p.stock <= (p.minStock ?? 12)) || p.isCritical);
  }, [products]);

  // Track stock levels to fire toast as soon as a product hits critical stock
  const initialAlertFiredRef = useRef(false);
  const previousStocksRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // 1. Initial visual toast trigger on dashboard load for the most critical item
    if (!initialAlertFiredRef.current && criticalProducts.length > 0) {
      initialAlertFiredRef.current = true;
      const timer = setTimeout(() => {
        const topCrit = [...criticalProducts].sort((a, b) => a.stock - b.stock)[0];
        triggerStockAlert({
          productId: topCrit.id,
          productName: topCrit.name,
          sku: topCrit.sku,
          brand: topCrit.brand,
          swatchHex: topCrit.swatchHex,
          swatchDot: topCrit.swatchDot,
          currentStock: topCrit.stock,
          minStock: topCrit.minStock ?? 12,
          stockUnit: topCrit.stockUnit || 'latas',
          type: topCrit.stock === 0 ? 'out_of_stock' : 'critical',
          title: topCrit.stock === 0 ? 'Ruptura Total de Estoque!' : 'Alerta: Estoque Crítico Atingido!',
          message: `Saldo atual é de apenas ${topCrit.stock} ${topCrit.stockUnit || 'latas'}. Limite de segurança é ${topCrit.minStock ?? 12}.`,
        });
      }, 700);
      return () => clearTimeout(timer);
    }

    // 2. Continuous monitoring: detect whenever a product drops to critical level
    products.forEach(p => {
      const prevStock = previousStocksRef.current[p.id];
      const min = p.minStock ?? 12;
      if (prevStock !== undefined && prevStock > min && p.stock <= min) {
        triggerStockAlert({
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          brand: p.brand,
          swatchHex: p.swatchHex,
          swatchDot: p.swatchDot,
          currentStock: p.stock,
          minStock: min,
          stockUnit: p.stockUnit || 'latas',
          type: p.stock === 0 ? 'out_of_stock' : 'critical',
          title: p.stock === 0 ? 'Ruptura Total de Estoque!' : 'Alerta de Nível Crítico!',
          message: `Atenção: Saldo de ${p.name} baixou para ${p.stock} ${p.stockUnit || 'latas'} (mínimo: ${min}).`,
        });
      }
      previousStocksRef.current[p.id] = p.stock;
    });
  }, [products, criticalProducts, triggerStockAlert]);

  // Synchronize period selector with chart tab
  useEffect(() => {
    if (period === 'hoje') {
      setChartTab('hourly');
    } else if (period === 'semana') {
      setChartTab('periodo');
    } else if (period === 'mes') {
      setChartTab('categoria');
    }
  }, [period]);

  // Completed sales reference (from props or default dataset)
  const salesList = useMemo(() => {
    return completedSales && completedSales.length > 0 ? completedSales : INITIAL_COMPLETED_SALES;
  }, [completedSales]);

  // Compute 7-day aggregated sales from completedSales
  const { periodSalesData, periodStats } = useMemo(() => {
    let refDate = new Date(2026, 8, 27); // default 27/09/2026
    salesList.forEach(s => {
      if (s.timestamp) {
        const m = s.timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) {
          const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
          if (d > refDate) refDate = d;
        }
      }
    });

    const daysOfWeekShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const days: {
      dateObj: Date;
      dateKey: string;
      dia: string;
      diaSemana: string;
      dataCompleta: string;
      faturamento: number;
      pedidos: number;
      descontos: number;
      meta: number;
      isToday: boolean;
    }[] = [];

    // Realistic baseline for days preceding the mock sales dataset
    const baseDailySeed: Record<string, { faturamento: number; pedidos: number }> = {
      '21/09': { faturamento: 2850, pedidos: 8 },
      '22/09': { faturamento: 3420, pedidos: 9 },
      '23/09': { faturamento: 4180, pedidos: 11 },
      '24/09': { faturamento: 3100, pedidos: 8 },
      '25/09': { faturamento: 4500, pedidos: 12 },
      '26/09': { faturamento: 5200, pedidos: 14 },
      '27/09': { faturamento: 0, pedidos: 0 },
    };

    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate);
      d.setDate(refDate.getDate() - i);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateKey = `${day}/${month}/${year}`;
      const shortKey = `${day}/${month}`;
      const diaSemana = daysOfWeekShort[d.getDay()];
      const isToday = i === 0;

      const seed = baseDailySeed[shortKey] || { faturamento: 2500, pedidos: 7 };

      days.push({
        dateObj: d,
        dateKey,
        dia: isToday ? `${shortKey} (Hoje)` : `${shortKey} (${diaSemana})`,
        diaSemana,
        dataCompleta: `${day}/${month}/${year} (${diaSemana})`,
        faturamento: seed.faturamento,
        pedidos: seed.pedidos,
        descontos: 0,
        meta: 5000,
        isToday,
      });
    }

    // Aggregate transactions from completedSales
    salesList.forEach(sale => {
      if (!sale.timestamp) return;
      const m = sale.timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        const saleDay = String(parseInt(m[1], 10)).padStart(2, '0');
        const saleMonth = String(parseInt(m[2], 10)).padStart(2, '0');
        const saleYear = m[3];
        const matchKey = `${saleDay}/${saleMonth}/${saleYear}`;

        const foundDay = days.find(d => d.dateKey === matchKey);
        if (foundDay) {
          foundDay.faturamento += sale.total || 0;
          foundDay.pedidos += 1;
          foundDay.descontos += sale.discount || 0;
        }
      }
    });

    let maxFaturamento = 0;
    let peakDayKey = '';
    days.forEach(d => {
      if (d.faturamento > maxFaturamento) {
        maxFaturamento = d.faturamento;
        peakDayKey = d.dateKey;
      }
    });

    let runningAccum = 0;
    const finalData = days.map(d => {
      runningAccum += d.faturamento;
      const ticketMedio = d.pedidos > 0 ? d.faturamento / d.pedidos : 0;
      return {
        ...d,
        ticketMedio,
        acumulado: runningAccum,
        isPeak: d.dateKey === peakDayKey,
      };
    });

    const totalRevenue7d = finalData.reduce((acc, d) => acc + d.faturamento, 0);
    const totalOrders7d = finalData.reduce((acc, d) => acc + d.pedidos, 0);
    const avgDaily = totalRevenue7d / Math.max(1, finalData.length);
    const avgTicket7d = totalRevenue7d / Math.max(1, totalOrders7d);
    const peakDay = finalData.find(d => d.isPeak) || finalData[finalData.length - 1];

    return {
      periodSalesData: finalData,
      periodStats: {
        totalRevenue7d,
        totalOrders7d,
        avgDaily,
        avgTicket7d,
        peakDay,
      }
    };
  }, [salesList]);

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

  // 30-day sales aggregated by product category (Tintas, Acessórios, Solventes, Preparação, Vernizes)
  const categorySalesData = useMemo(() => {
    // Base 30-day distribution calibrated with monthly store volume (R$ 382.400)
    const baseCategories: Record<string, {
      categoria: string;
      categoriaCurta: string;
      faturamento: number;
      volume: number;
      unidade: string;
      ticketMedio: number;
      margem: number;
      cor: string;
      icon: string;
      marcas: string;
      destaque: string;
    }> = {
      tintas: {
        categoria: 'Tintas Imobiliárias & Automotivas',
        categoriaCurta: 'Tintas',
        faturamento: 218450.00,
        volume: 980,
        unidade: 'latas/galões',
        ticketMedio: 385.00,
        margem: 41.5,
        cor: '#00687a',
        icon: 'format_paint',
        marcas: 'Suvinil, Coral, PPG, Lukscolor',
        destaque: 'Acrílico Fosco 18L & Linha PU Automotiva',
      },
      preparacao: {
        categoria: 'Preparação & Massas',
        categoriaCurta: 'Preparação',
        faturamento: 54300.00,
        volume: 540,
        unidade: 'baldes/galões',
        ticketMedio: 100.50,
        margem: 38.0,
        cor: '#0f2744',
        icon: 'construction',
        marcas: 'Suvinil, Maxi Rubber, Coral',
        destaque: 'Massa Corrida PVA 25kg & Primer PU',
      },
      solventes: {
        categoria: 'Solventes & Diluentes',
        categoriaCurta: 'Solventes',
        faturamento: 42800.00,
        volume: 690,
        unidade: 'latas/frascos',
        ticketMedio: 62.00,
        margem: 46.2,
        cor: '#0284c7',
        icon: 'science',
        marcas: 'Natrielli, Maxi Rubber, PPG',
        destaque: 'Aguarrás Mineral 900ml & Thinner PU',
      },
      acessorios: {
        categoria: 'Acessórios de Pintura',
        categoriaCurta: 'Acessórios',
        faturamento: 38650.00,
        volume: 1150,
        unidade: 'unidades',
        ticketMedio: 33.60,
        margem: 52.4,
        cor: '#f59e0b',
        icon: 'brush',
        marcas: 'Tigre Pro, 3M, Atlas',
        destaque: 'Rolo Microfibra 23cm & Fita Crepe 3M',
      },
      vernizes: {
        categoria: 'Vernizes & Resinas',
        categoriaCurta: 'Vernizes',
        faturamento: 28200.00,
        volume: 210,
        unidade: 'galões/latas',
        ticketMedio: 134.30,
        margem: 44.0,
        cor: '#8b5cf6',
        icon: 'layers',
        marcas: 'Sparlack, Lukscolor, Viapol',
        destaque: 'Verniz Marítimo & Resina Epóxi Piso',
      },
    };

    // Dynamically incorporate real recent sales items into category metrics
    salesList.forEach(sale => {
      if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
          const prodName = (item.product?.name || '').toLowerCase();
          const prodCat = (item.product?.category || '').toLowerCase();
          const itemTotal = (item.product?.price || 0) * item.quantity;
          const qty = item.quantity;

          if (
            prodName.includes('thinner') ||
            prodName.includes('aguarrás') ||
            prodName.includes('aguarras') ||
            prodName.includes('solvente') ||
            prodName.includes('diluente')
          ) {
            baseCategories.solventes.faturamento += itemTotal;
            baseCategories.solventes.volume += qty;
          } else if (
            prodCat === 'acessorios' ||
            prodName.includes('rolo') ||
            prodName.includes('trincha') ||
            prodName.includes('fita') ||
            prodName.includes('lixa') ||
            prodName.includes('espátula') ||
            prodName.includes('espatula')
          ) {
            baseCategories.acessorios.faturamento += itemTotal;
            baseCategories.acessorios.volume += qty;
          } else if (
            prodCat === 'vernizes' ||
            prodName.includes('verniz') ||
            prodName.includes('resina') ||
            prodName.includes('epóxi') ||
            prodName.includes('epoxi')
          ) {
            baseCategories.vernizes.faturamento += itemTotal;
            baseCategories.vernizes.volume += qty;
          } else if (
            prodCat === 'preparacao' ||
            prodCat === 'complementos' ||
            prodName.includes('massa') ||
            prodName.includes('selador') ||
            prodName.includes('primer') ||
            prodName.includes('fundo')
          ) {
            baseCategories.preparacao.faturamento += itemTotal;
            baseCategories.preparacao.volume += qty;
          } else {
            // Default to Tintas (imobiliária, automotiva, metais, esmaltes)
            baseCategories.tintas.faturamento += itemTotal;
            baseCategories.tintas.volume += qty;
          }
        });
      }
    });

    const list = Object.values(baseCategories);
    const totalRev = list.reduce((sum, c) => sum + c.faturamento, 0);
    const totalVol = list.reduce((sum, c) => sum + c.volume, 0);

    return list.map(c => ({
      ...c,
      participacao: totalRev > 0 ? (c.faturamento / totalRev) * 100 : 0,
      totalGeralFaturamento: totalRev,
      totalGeralVolume: totalVol,
    }));
  }, [salesList]);

  const categoryStats = useMemo(() => {
    const totalRevenue = categorySalesData.reduce((acc, c) => acc + c.faturamento, 0);
    const totalVolume = categorySalesData.reduce((acc, c) => acc + c.volume, 0);
    const topCategory = categorySalesData.reduce((max, c) => (c.faturamento > max.faturamento ? c : max), categorySalesData[0]);
    const highestMarginCategory = categorySalesData.reduce((max, c) => (c.margem > max.margem ? c : max), categorySalesData[0]);
    return {
      totalRevenue,
      totalVolume,
      topCategory,
      highestMarginCategory,
    };
  }, [categorySalesData]);

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
                {criticalProducts.length} itens
              </div>
              <span className="text-[11px] text-[#ba1a1a] font-semibold">repor agora ➔</span>
            </div>
            <div className="mt-2 text-xs text-[#44474d] truncate">
              {criticalProducts.slice(0, 2).map(p => p.name).join(', ') || 'Nenhum item em ruptura'}
            </div>
            <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between">
              <span className="text-[10px] text-[#ba1a1a] font-semibold">Toasts automáticos</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (criticalProducts[0]) {
                    triggerStockAlert({
                      productId: criticalProducts[0].id,
                      productName: criticalProducts[0].name,
                      sku: criticalProducts[0].sku,
                      brand: criticalProducts[0].brand,
                      swatchHex: criticalProducts[0].swatchHex,
                      swatchDot: criticalProducts[0].swatchDot,
                      currentStock: criticalProducts[0].stock,
                      minStock: criticalProducts[0].minStock ?? 12,
                      stockUnit: criticalProducts[0].stockUnit || 'latas',
                      type: criticalProducts[0].stock === 0 ? 'out_of_stock' : 'critical',
                      title: criticalProducts[0].stock === 0 ? 'Ruptura Total de Estoque!' : 'Alerta: Estoque Crítico Atingido!',
                      message: `Restam apenas ${criticalProducts[0].stock} ${criticalProducts[0].stockUnit || 'latas'} de ${criticalProducts[0].name}.`,
                    });
                  } else {
                    testStockAlert();
                  }
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-[#ba1a1a] border border-red-200 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Disparar aviso visual flutuante (toast) agora"
              >
                <span className="material-symbols-outlined text-xs">campaign</span>
                <span>Disparar Toast</span>
              </button>
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

      {/* SEÇÃO DE NOTIFICAÇÕES DE ESTOQUE CRÍTICO: Avisos Visuais (Toasts) em Tempo Real */}
      <section className="bg-gradient-to-r from-red-50/90 via-white to-amber-50/60 dark:from-[#1b1c24] dark:via-[#181a20] dark:to-[#1f1a1d] rounded-2xl border-2 border-red-300/80 dark:border-red-900/60 p-4 sm:p-5 shadow-xs transition-all">
        {/* Banner Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-red-200/80 dark:border-red-900/40">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ba1a1a] text-white flex items-center justify-center shrink-0 shadow-xs relative">
              <span className="material-symbols-outlined text-xl">notifications_active</span>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-[#001229] dark:text-white flex items-center gap-1.5">
                  <span>Sistema de Notificações & Avisos Visuais de Estoque</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#ba1a1a] text-white tracking-wide uppercase animate-pulse">
                  {criticalProducts.length} {criticalProducts.length === 1 ? 'Produto Crítico' : 'Produtos Críticos'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Monitoramento Ativo no Painel
                </span>
              </div>
              <p className="text-xs text-[#44474d] dark:text-slate-300 mt-1">
                Disparo instantâneo de toasts visuais flutuantes com bipe sonoro suave, temporizador regressivo de 8s e atalho para reposição imediata.
              </p>
            </div>
          </div>

          {/* Quick Actions & Controls Cluster */}
          <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                soundEnabled
                  ? 'bg-white dark:bg-slate-800 text-[#00687a] dark:text-[#57dffe] border-[#00687a]/40 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300'
              }`}
              title={soundEnabled ? 'Silenciar bipes de áudio dos toasts' : 'Ativar bipes de áudio dos toasts'}
            >
              <span className="material-symbols-outlined text-sm">
                {soundEnabled ? 'volume_up' : 'volume_off'}
              </span>
              <span>{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
            </button>

            {/* Test / Simulate Toast Button */}
            <button
              type="button"
              onClick={() => testStockAlert()}
              className="px-3.5 py-1.5 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Disparar toast de teste na tela agora"
            >
              <span className="material-symbols-outlined text-sm">campaign</span>
              <span>Disparar Toast de Teste</span>
            </button>

            {/* Navigate to Estoque */}
            {onNavigateToEstoque && (
              <button
                type="button"
                onClick={onNavigateToEstoque}
                className="px-3 py-1.5 rounded-lg bg-[#001229] hover:bg-[#00244e] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">inventory_2</span>
                <span>Ir para Estoque ➔</span>
              </button>
            )}
          </div>
        </div>

        {/* Critical Items Horizontal Quick Action Strip */}
        <div className="pt-3">
          <div className="text-[11px] font-bold text-[#74777e] uppercase tracking-wider mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>Produtos com Ruptura ou Abaixo do Mínimo de Segurança:</span>
            <span className="font-mono text-[10px] text-[#ba1a1a]">
              Clique em "Disparar Toast" para exibir o alerta visual de qualquer item
            </span>
          </div>

          {criticalProducts.length === 0 ? (
            <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-emerald-300 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
              <span>Todos os produtos do catálogo estão com estoque saudável acima do nível crítico de segurança.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {criticalProducts.map(prod => {
                const min = prod.minStock ?? 12;
                const isZero = prod.stock <= 0;
                const pct = Math.min(100, Math.round((prod.stock / min) * 100));

                return (
                  <div
                    key={prod.id}
                    className="bg-white dark:bg-slate-800/90 rounded-xl border border-red-200 dark:border-red-900/60 p-3 flex items-center justify-between gap-3 shadow-2xs hover:border-red-400 transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Product Swatch */}
                      <div
                        className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center shrink-0 border border-black/10 relative"
                        style={{ backgroundColor: prod.swatchHex || '#e2e8f0' }}
                      >
                        {prod.swatchDot ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full ring-1 ring-white/80"
                            style={{ backgroundColor: prod.swatchDot }}
                          />
                        ) : (
                          <span className="material-symbols-outlined text-xs text-slate-700">format_paint</span>
                        )}
                        <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-600 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                          !
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#001229] dark:text-white truncate" title={prod.name}>
                          {prod.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#74777e] dark:text-slate-400">
                          <span className="font-mono">{prod.sku}</span>
                          <span>•</span>
                          <span className="font-semibold text-[#00687a] dark:text-[#57dffe]">{prod.brand}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] mt-0.5">
                          <span className="font-mono font-extrabold text-[#ba1a1a] dark:text-red-400">
                            {prod.stock} {prod.stockUnit || 'latas'}
                          </span>
                          <span className="text-[10px] text-[#74777e]">/ mín {min}</span>
                          <span className="text-[10px] text-red-600 font-bold ml-1">
                            ({isZero ? 'ESGOTADO' : `${pct}% seguro`})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Toast Trigger and Replenish */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          triggerStockAlert({
                            productId: prod.id,
                            productName: prod.name,
                            sku: prod.sku,
                            brand: prod.brand,
                            swatchHex: prod.swatchHex,
                            swatchDot: prod.swatchDot,
                            currentStock: prod.stock,
                            minStock: min,
                            stockUnit: prod.stockUnit || 'latas',
                            type: isZero ? 'out_of_stock' : 'critical',
                            title: isZero ? 'Ruptura Total de Estoque!' : 'Alerta: Estoque Crítico Atingido!',
                            message: `Estoque atingiu apenas ${prod.stock} ${prod.stockUnit || 'latas'}. Limite de segurança é ${min}.`,
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-[#ba1a1a] border border-red-200 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
                        title="Disparar toast flutuante para este produto"
                      >
                        <span className="material-symbols-outlined text-xs">campaign</span>
                        <span className="hidden sm:inline">Disparar Toast</span>
                      </button>

                      {onNavigateToEstoque && (
                        <button
                          type="button"
                          onClick={onNavigateToEstoque}
                          className="px-2 py-1 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="Ir para a reposição de estoque"
                        >
                          <span>Repor</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* MIDDLE SECTION: Chart Analytics (8 cols / ~66%) & Real-Time PDV Stream (4 cols / ~34%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Curve Section: Recharts Vendas por Período (Últimos 7 Dias) & Vendas por Hora */}
        <section className="lg:col-span-8 bg-white rounded-xl border border-[#c4c6ce]/40 p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header: Mode Selector & Telemetry Indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3 border-b border-[#c4c6ce]/30 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-bold text-[#001229]">
                    {chartTab === 'periodo'
                      ? 'Vendas por Período — Últimos 7 Dias'
                      : chartTab === 'hourly'
                      ? 'Volume de Vendas por Hora — Hoje'
                      : 'Vendas por Categoria de Produto — Últimos 30 Dias'}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#acedff] text-[#004e5c]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00687a] animate-pulse"></span>
                    {chartTab === 'periodo'
                      ? 'completedSales Consolidado'
                      : chartTab === 'hourly'
                      ? 'Fluxo em Tempo Real'
                      : 'Recharts • 30 Dias'}
                  </span>
                </div>
                <p className="text-xs text-[#44474d] mt-0.5">
                  {chartTab === 'periodo'
                    ? 'Acompanhamento do faturamento diário, volume de tíquetes e ticket médio nos últimos 7 dias'
                    : chartTab === 'hourly'
                    ? 'Acompanhamento hora a hora do fluxo de caixa e volume de pedidos no PDV'
                    : 'Comparativo de vendas totais por categoria (Tintas, Acessórios, Solventes, Preparação e Vernizes)'}
                </p>
              </div>

              {/* View Switcher: Vendas por Período vs Vendas por Hora vs Vendas por Categoria */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
                <div className="inline-flex rounded-lg border border-[#c4c6ce]/50 p-0.5 bg-[#f0f3ff]/60 shadow-xs flex-wrap">
                  <button
                    type="button"
                    onClick={() => setChartTab('periodo')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                      chartTab === 'periodo'
                        ? 'bg-[#001229] text-white shadow-xs'
                        : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">trending_up</span>
                    <span>7 Dias</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTab('hourly')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${
                      chartTab === 'hourly'
                        ? 'bg-[#001229] text-white shadow-xs'
                        : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>Hoje</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTab('categoria')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                      chartTab === 'categoria'
                        ? 'bg-[#001229] text-white shadow-xs'
                        : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">bar_chart</span>
                    <span>Categorias (30 Dias)</span>
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

            {/* TAB: RECHARTS VENDAS POR PERÍODO (ÚLTIMOS 7 DIAS) */}
            {chartTab === 'periodo' && (
              <div className="space-y-4">
                {/* 7-Day Live Telemetry Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-[#f0f3ff]/70 border border-[#dee8ff]">
                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Faturamento (7 Dias)
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      R$ {periodStats.totalRevenue7d.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#00687a] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-xs">trending_up</span>
                      <span>{periodStats.totalOrders7d} pedidos concluídos</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Média Diária (7d)
                    </div>
                    <div className="text-base font-mono font-bold text-[#0f2744]">
                      R$ {periodStats.avgDaily.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e] mt-0.5">
                      meta: R$ 5.000,00/dia
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Ticket Médio
                    </div>
                    <div className="text-base font-mono font-bold text-[#00687a]">
                      R$ {periodStats.avgTicket7d.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#74777e] mt-0.5">
                      por pedido registrado
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Melhor Dia (Pico)
                    </div>
                    <div className="text-base font-mono font-bold text-emerald-700 truncate">
                      {periodStats.peakDay?.dia.split(' ')[0]}
                    </div>
                    <div className="text-[10px] text-emerald-800 font-mono font-semibold mt-0.5 truncate">
                      R$ {periodStats.peakDay?.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Sub-selector for Metrics View */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPeriodMetricView('faturamento')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        periodMetricView === 'faturamento'
                          ? 'bg-[#001229] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      📈 Faturamento Diário (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodMetricView('acumulado')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        periodMetricView === 'acumulado'
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      🚀 Faturamento + Acumulado
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodMetricView('pedidos')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        periodMetricView === 'pedidos'
                          ? 'bg-[#0f2744] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      🧾 Volume de Pedidos
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodMetricView('ticket')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        periodMetricView === 'ticket'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      🏷️ Ticket Médio
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#74777e]">
                    <span className="inline-block w-2.5 h-0.5 bg-[#ba1a1a]"></span>
                    <span>Linha Vermelha: Média 7 Dias</span>
                  </div>
                </div>

                {/* Recharts LineChart for Vendas por Período */}
                <div className="w-full h-72 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={periodSalesData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                      <XAxis
                        dataKey="dia"
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
                      {periodMetricView === 'pedidos' && (
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
                      <Tooltip content={<CustomPeriodTooltip />} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: 6, fontSize: '11px' }}
                        iconType="circle"
                      />
                      <ReferenceLine
                        yAxisId="revenue"
                        y={periodStats.avgDaily}
                        stroke="#ba1a1a"
                        strokeDasharray="4 4"
                        label={{
                          value: `Média R$ ${(periodStats.avgDaily / 1000).toFixed(1)}k`,
                          fill: '#ba1a1a',
                          fontSize: 10,
                          position: 'insideTopLeft',
                        }}
                      />

                      {/* Primary Line: Daily Sales Revenue */}
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="faturamento"
                        name="Faturamento Diário (R$)"
                        stroke="#00687a"
                        strokeWidth={3.5}
                        dot={{ r: 4.5, fill: '#ffffff', stroke: '#00687a', strokeWidth: 2 }}
                        activeDot={{ r: 7, stroke: '#0f2744', strokeWidth: 2, fill: '#57dffe' }}
                      />

                      {/* Secondary Line: Cumulative Sales */}
                      {periodMetricView === 'acumulado' && (
                        <Line
                          yAxisId="revenue"
                          type="monotone"
                          dataKey="acumulado"
                          name="Acumulado 7 Dias (R$)"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          dot={false}
                          activeDot={{ r: 5, fill: '#22d3ee' }}
                        />
                      )}

                      {/* Secondary Line: Order Count */}
                      {periodMetricView === 'pedidos' && (
                        <Line
                          yAxisId="tickets"
                          type="monotone"
                          dataKey="pedidos"
                          name="Pedidos / Tíquetes"
                          stroke="#0f2744"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#0f2744' }}
                          activeDot={{ r: 6, fill: '#57dffe' }}
                        />
                      )}

                      {/* Secondary Line: Average Ticket */}
                      {periodMetricView === 'ticket' && (
                        <Line
                          yAxisId="revenue"
                          type="monotone"
                          dataKey="ticketMedio"
                          name="Ticket Médio (R$)"
                          stroke="#166534"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#166534' }}
                          activeDot={{ r: 6, fill: '#86efac' }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Day-by-day Micro Breakdown Strip for the 7 Days */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-[#c4c6ce]/30">
                  {periodSalesData.map((d, idx) => {
                    const peakVal = Math.max(1, periodStats.peakDay?.faturamento || 1);
                    const pctOfPeak = Math.min(100, Math.round((d.faturamento / peakVal) * 100));

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border transition-all ${
                          d.isToday
                            ? 'bg-[#e7eeff] border-[#00687a] shadow-xs'
                            : d.isPeak
                            ? 'bg-amber-50/70 border-amber-300'
                            : 'bg-[#f0f3ff]/40 border-[#dee8ff] hover:bg-[#f0f3ff]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[#74777e] text-[10px]">
                          <span className={`font-semibold ${d.isToday ? 'text-[#00687a]' : ''}`}>
                            {d.dia.split(' ')[0]}
                          </span>
                          <span className="font-bold text-[#44474d]">{d.diaSemana}</span>
                        </div>
                        <div className="font-mono font-bold text-[#001229] mt-1 text-xs truncate">
                          R$ {d.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-[#74777e] flex items-center justify-between mt-0.5">
                          <span>{d.pedidos} {d.pedidos === 1 ? 'venda' : 'vendas'}</span>
                          {d.isPeak && (
                            <span className="text-[9px] font-bold text-amber-700">Pico</span>
                          )}
                          {d.isToday && (
                            <span className="text-[9px] font-bold text-[#00687a]">Hoje</span>
                          )}
                        </div>
                        <div className="h-1 w-full bg-[#dee8ff] rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${
                              d.isToday ? 'bg-[#00687a]' : d.isPeak ? 'bg-amber-500' : 'bg-[#0f2744]'
                            }`}
                            style={{ width: `${pctOfPeak}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: RECHARTS VENDAS POR CATEGORIA DE PRODUTO (ÚLTIMOS 30 DIAS) */}
            {chartTab === 'categoria' && (
              <div className="space-y-4">
                {/* 30-Day Category Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-[#f0f3ff]/70 border border-[#dee8ff]">
                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Faturamento (30 Dias)
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      R$ {categoryStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#00687a] font-semibold mt-0.5">
                      5 categorias ativas
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Líder em Vendas
                    </div>
                    <div className="text-base font-bold text-[#00687a] truncate">
                      {categoryStats.topCategory.categoriaCurta}
                    </div>
                    <div className="text-[10px] text-[#74777e] font-mono mt-0.5">
                      R$ {categoryStats.topCategory.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} ({categoryStats.topCategory.participacao.toFixed(1)}%)
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Maior Margem
                    </div>
                    <div className="text-base font-bold text-amber-600 truncate">
                      {categoryStats.highestMarginCategory.categoriaCurta}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      {categoryStats.highestMarginCategory.margem.toFixed(1)}% margem líquida
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-[#74777e] uppercase tracking-wider">
                      Volume Total Vendido
                    </div>
                    <div className="text-base font-mono font-bold text-[#001229]">
                      {categoryStats.totalVolume.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#74777e]">un</span>
                    </div>
                    <div className="text-[10px] text-[#74777e] mt-0.5">
                      tintas, solventes e acess.
                    </div>
                  </div>
                </div>

                {/* Metric Selector Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#74777e] text-[11px] font-medium">Exibir no gráfico:</span>
                    <button
                      type="button"
                      onClick={() => setCategoryMetricView('faturamento')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        categoryMetricView === 'faturamento'
                          ? 'bg-[#001229] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      💰 Vendas Totais (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryMetricView('volume')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        categoryMetricView === 'volume'
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      📦 Volume Vendido (Unidades)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryMetricView('margem')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        categoryMetricView === 'margem'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      📊 Margem de Contribuição (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryMetricView('ticket')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        categoryMetricView === 'ticket'
                          ? 'bg-[#0f2744] text-white shadow-2xs'
                          : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                      }`}
                    >
                      🏷️ Ticket Médio
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#74777e]">
                    <span className="material-symbols-outlined text-xs text-[#00687a]">bar_chart</span>
                    <span>Recharts BarChart • Cores por Categoria</span>
                  </div>
                </div>

                {/* Recharts BarChart */}
                <div className="w-full h-72 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categorySalesData} margin={{ top: 15, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                      <XAxis
                        dataKey="categoriaCurta"
                        stroke="#74777e"
                        fontSize={11}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: '#c4c6ce' }}
                      />
                      <YAxis
                        stroke="#74777e"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val: number) => {
                          if (categoryMetricView === 'faturamento') {
                            return `R$ ${(val / 1000).toFixed(val >= 1000 ? 0 : 1)}k`;
                          } else if (categoryMetricView === 'volume') {
                            return `${val}`;
                          } else if (categoryMetricView === 'margem') {
                            return `${val}%`;
                          } else {
                            return `R$ ${val}`;
                          }
                        }}
                      />
                      <Tooltip content={<CustomCategoryTooltip />} cursor={{ fill: 'rgba(0, 104, 122, 0.05)' }} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: 6, fontSize: '11px' }}
                      />
                      <Bar
                        dataKey={categoryMetricView}
                        name={
                          categoryMetricView === 'faturamento'
                            ? 'Vendas Totais nos Últimos 30 Dias (R$)'
                            : categoryMetricView === 'volume'
                            ? 'Volume Vendido (Unidades)'
                            : categoryMetricView === 'margem'
                            ? 'Margem de Contribuição Média (%)'
                            : 'Ticket Médio por Venda (R$)'
                        }
                        radius={[6, 6, 0, 0]}
                        barSize={44}
                      >
                        {categorySalesData.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={entry.cor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Category summary cards strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-[#c4c6ce]/30">
                  {categorySalesData.map((cat, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-[#c4c6ce]/40 bg-white hover:bg-[#f0f3ff]/40 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.cor }}></span>
                        <span className="font-bold text-[#001229] text-xs truncate" title={cat.categoria}>
                          {cat.categoriaCurta}
                        </span>
                      </div>
                      <div className="font-mono font-bold text-xs text-[#001229]">
                        R$ {cat.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#74777e] mt-1">
                        <span>{cat.participacao.toFixed(1)}% do total</span>
                        <span className="font-medium text-emerald-700">{cat.margem.toFixed(0)}% mrg</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${cat.participacao}%`, backgroundColor: cat.cor }}
                        />
                      </div>
                    </div>
                  ))}
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
                  onClick={onNavigateToVendas || onNavigateToPDV}
                  title="Clique para abrir detalhes no Histórico de Vendas"
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
              onClick={onNavigateToVendas || onNavigateToPDV}
              className="text-xs font-bold text-[#00687a] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Ver Histórico</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </section>
      </div>

      {/* DEDICATED SECTION: Comparativo Consolidado de Vendas por Categoria (Últimos 30 Dias) - Recharts BarChart */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/40 p-5 shadow-xs space-y-5">
        {/* Section Header with Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#c4c6ce]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e7eeff] text-[#00687a] flex items-center justify-center shrink-0 border border-[#dee8ff] shadow-xs">
              <span className="material-symbols-outlined text-2xl">bar_chart</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[17px] font-bold text-[#001229] tracking-tight">
                  Comparativo de Vendas por Categoria de Produto — Últimos 30 Dias
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#acedff] text-[#004e5c] uppercase tracking-wider">
                  Recharts BarChart
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#f0f3ff] text-[#001229] border border-[#c4c6ce]/40">
                  Total: R$ {categoryStats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-xs text-[#44474d] mt-1 max-w-3xl">
                Demonstrativo analítico de vendas entre as famílias de produtos da loja: <strong>Tintas</strong> (Imobiliárias e Automotivas), <strong>Acessórios</strong> (Rolos, Trinchas e Fitas), <strong>Solventes & Diluentes</strong> (Thinner e Aguarrás), <strong>Preparação & Massas</strong> e <strong>Vernizes & Resinas</strong>.
              </p>
            </div>
          </div>

          {/* Metric Selector Buttons */}
          <div className="flex items-center gap-1.5 self-start lg:self-center flex-wrap">
            <div className="inline-flex rounded-lg border border-[#c4c6ce]/50 p-0.5 bg-[#f0f3ff]/60 shadow-xs flex-wrap">
              <button
                type="button"
                onClick={() => setCategoryMetricView('faturamento')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                  categoryMetricView === 'faturamento'
                    ? 'bg-[#001229] text-white shadow-xs'
                    : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                }`}
                title="Visualizar faturamento total em Reais (R$)"
              >
                <span>💰 Faturamento (R$)</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryMetricView('volume')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                  categoryMetricView === 'volume'
                    ? 'bg-[#00687a] text-white shadow-xs'
                    : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                }`}
                title="Visualizar quantidade de unidades comercializadas"
              >
                <span>📦 Volume (Unid.)</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryMetricView('margem')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                  categoryMetricView === 'margem'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                }`}
                title="Visualizar margem percentual de contribuição"
              >
                <span>📊 Margem (%)</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryMetricView('ticket')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                  categoryMetricView === 'ticket'
                    ? 'bg-[#0f2744] text-white shadow-xs'
                    : 'text-[#44474d] hover:text-[#001229] hover:bg-white font-medium'
                }`}
                title="Visualizar ticket médio por venda"
              >
                <span>🏷️ Ticket Médio</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recharts BarChart Interactive Component */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categorySalesData}
              margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
              <XAxis
                dataKey="categoriaCurta"
                stroke="#74777e"
                fontSize={12}
                fontWeight={700}
                tickLine={false}
                axisLine={{ stroke: '#c4c6ce' }}
              />
              <YAxis
                stroke="#74777e"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => {
                  if (categoryMetricView === 'faturamento') {
                    return `R$ ${(val / 1000).toFixed(0)}k`;
                  } else if (categoryMetricView === 'volume') {
                    return `${val} un`;
                  } else if (categoryMetricView === 'margem') {
                    return `${val}%`;
                  } else {
                    return `R$ ${val}`;
                  }
                }}
              />
              <Tooltip content={<CustomCategoryTooltip />} cursor={{ fill: 'rgba(0, 104, 122, 0.05)' }} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: '12px', fontWeight: 600 }}
              />
              <Bar
                dataKey={categoryMetricView}
                name={
                  categoryMetricView === 'faturamento'
                    ? 'Vendas Totais por Categoria nos Últimos 30 Dias (R$)'
                    : categoryMetricView === 'volume'
                    ? 'Volume Comercializado (Unidades / Latas)'
                    : categoryMetricView === 'margem'
                    ? 'Margem Média de Contribuição (%)'
                    : 'Ticket Médio de Venda por Categoria (R$)'
                }
                radius={[8, 8, 0, 0]}
                barSize={52}
              >
                {categorySalesData.map((entry, index) => (
                  <Cell key={`dedicated-bar-cell-${index}`} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 5 High-Density Category Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-2">
          {categorySalesData.map((cat, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl border border-[#c4c6ce]/50 bg-white hover:border-[#00687a] hover:shadow-xs transition-all relative overflow-hidden flex flex-col justify-between group"
            >
              {/* Top Accent Strip */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: cat.cor }}
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: cat.cor }}
                    >
                      <span className="material-symbols-outlined text-base">{cat.icon}</span>
                    </span>
                    <span className="font-bold text-xs text-[#001229] truncate" title={cat.categoria}>
                      {cat.categoriaCurta}
                    </span>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                    style={{ backgroundColor: `${cat.cor}18`, color: cat.cor }}
                  >
                    {cat.participacao.toFixed(1)}%
                  </span>
                </div>

                {/* Main Metric Value */}
                <div className="text-[19px] font-bold font-mono text-[#001229] tracking-tight">
                  R$ {cat.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${cat.participacao}%`, backgroundColor: cat.cor }}
                  />
                </div>
              </div>

              {/* Sub-metrics */}
              <div className="mt-3 pt-2.5 border-t border-[#c4c6ce]/30 space-y-1 text-[11px]">
                <div className="flex justify-between items-center text-[#44474d]">
                  <span>Volume:</span>
                  <span className="font-mono font-bold text-[#001229]">
                    {cat.volume.toLocaleString('pt-BR')} {cat.unidade}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#44474d]">
                  <span>Margem:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {cat.margem.toFixed(1)}% líquida
                  </span>
                </div>
                <div className="text-[10px] text-[#74777e] truncate pt-1" title={cat.marcas}>
                  Marcas: <span className="font-medium text-[#001229]">{cat.marcas}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Strategic Mix Summary Banner */}
        <div className="p-3.5 rounded-xl bg-[#f0f3ff]/70 border border-[#dee8ff] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#001229]">
            <span className="material-symbols-outlined text-[#00687a] text-base shrink-0">insights</span>
            <span>
              <strong>Destaques do Mix nos Últimos 30 Dias:</strong> A categoria de <strong>Tintas</strong> concentra o maior volume de faturamento ({categorySalesData[0]?.participacao.toFixed(1)}%), enquanto <strong>Acessórios</strong> ({categorySalesData[3]?.margem.toFixed(1)}%) e <strong>Solventes</strong> ({categorySalesData[2]?.margem.toFixed(1)}%) entregam as maiores margens brutas operacionais.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-[#74777e]">
              Atualização: <strong>Hoje, 14:32</strong>
            </span>
          </div>
        </div>
      </section>

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
