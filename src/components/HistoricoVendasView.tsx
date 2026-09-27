import React, { useState, useMemo } from 'react';
import { CompletedSaleData, CartItem } from '../types';
import { STORE_CONFIG } from '../data/storeConfig';

interface HistoricoVendasViewProps {
  sales: CompletedSaleData[];
  onNavigateToPDVWithItems?: (items: CartItem[]) => void;
  onNavigateToPDV?: () => void;
}

type DatePreset = 'hoje' | 'ontem' | '7dias' | '30dias' | 'todos' | 'custom';
type PaymentFilter = 'todos' | 'pix' | 'credito' | 'debito' | 'dinheiro' | 'faturado';

export const HistoricoVendasView: React.FC<HistoricoVendasViewProps> = ({
  sales,
  onNavigateToPDVWithItems,
  onNavigateToPDV,
}) => {
  // Search query (Customer name, document, order number, nfce)
  const [searchQuery, setSearchQuery] = useState('');

  // Payment method filter
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('todos');

  // Date filters
  const [datePreset, setDatePreset] = useState<DatePreset>('todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Operator filter
  const [operatorFilter, setOperatorFilter] = useState<string>('todos');

  // Selected sale for detailed modal view
  const [selectedSale, setSelectedSale] = useState<CompletedSaleData | null>(null);

  // Quick printable receipt modal
  const [printReceiptSale, setPrintReceiptSale] = useState<CompletedSaleData | null>(null);

  // Copy notification state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Available unique operators
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => {
      if (s.operatorName) set.add(s.operatorName);
    });
    return Array.from(set);
  }, [sales]);

  // Helper to parse DD/MM/YYYY from timestamp strings (e.g. "27/09/2026 14:28:10")
  const parseSaleDate = (timestampStr: string): Date | null => {
    if (!timestampStr) return null;
    const parts = timestampStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      let hour = 12;
      let minute = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        if (timeParts.length >= 2) {
          hour = parseInt(timeParts[0], 10);
          minute = parseInt(timeParts[1], 10);
        }
      }
      return new Date(year, month, day, hour, minute);
    }
    const d = new Date(timestampStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Helper to check payment method match
  const matchesPayment = (method: string, filter: PaymentFilter): boolean => {
    if (filter === 'todos') return true;
    const m = (method || '').toLowerCase();
    if (filter === 'pix') return m.includes('pix');
    if (filter === 'credito') return m.includes('crédito') || m.includes('credito');
    if (filter === 'debito') return m.includes('débito') || m.includes('debito');
    if (filter === 'dinheiro') return m.includes('dinheiro');
    if (filter === 'faturado') return m.includes('faturado') || m.includes('boleto') || m.includes('prazo');
    return true;
  };

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const clientName = (sale.client?.name || '').toLowerCase();
        const clientDoc = (sale.client?.doc || '').replace(/\D/g, '');
        const clientDocRaw = (sale.client?.doc || '').toLowerCase();
        const orderNum = (sale.orderNumber || '').toLowerCase();
        const nfce = (sale.nfceNumber || '').toLowerCase();
        const accessKey = (sale.accessKey || '').toLowerCase().replace(/\s/g, '');
        const qClean = q.replace(/\D/g, '');

        const matchesQuery =
          clientName.includes(q) ||
          clientDocRaw.includes(q) ||
          (qClean.length > 2 && clientDoc.includes(qClean)) ||
          orderNum.includes(q) ||
          nfce.includes(q) ||
          accessKey.includes(q);

        if (!matchesQuery) return false;
      }

      // 2. Payment Method Filter
      if (!matchesPayment(sale.paymentMethod, paymentFilter)) {
        return false;
      }

      // 3. Operator Filter
      if (operatorFilter !== 'todos' && sale.operatorName !== operatorFilter) {
        return false;
      }

      // 4. Date Filter
      const saleDate = parseSaleDate(sale.timestamp);
      if (!saleDate) return true;

      // Base date reference: today is 27/09/2026 based on mock system environment
      const todayStr = '2026-09-27';
      const saleDateStr = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(
        saleDate.getDate()
      ).padStart(2, '0')}`;

      if (datePreset === 'hoje') {
        if (saleDateStr !== todayStr && saleDate.toLocaleDateString('pt-BR') !== new Date().toLocaleDateString('pt-BR')) {
          return false;
        }
      } else if (datePreset === 'ontem') {
        const yesterday = new Date(2026, 8, 26);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
          yesterday.getDate()
        ).padStart(2, '0')}`;
        if (saleDateStr !== yStr) return false;
      } else if (datePreset === '7dias') {
        const limit = new Date(2026, 8, 20); // 7 days prior
        if (saleDate < limit) return false;
      } else if (datePreset === '30dias') {
        const limit = new Date(2026, 7, 27); // 30 days prior
        if (saleDate < limit) return false;
      } else if (datePreset === 'custom') {
        if (startDate && saleDateStr < startDate) return false;
        if (endDate && saleDateStr > endDate) return false;
      }

      return true;
    });
  }, [sales, searchQuery, paymentFilter, operatorFilter, datePreset, startDate, endDate]);

  // Aggregate telemetry metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalDiscount = 0;
    let totalItemsCount = 0;
    const paymentCounts: Record<string, number> = {};

    filteredSales.forEach((sale) => {
      totalRevenue += sale.total || 0;
      totalDiscount += sale.discount || 0;
      const itemsInSale = sale.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
      totalItemsCount += itemsInSale;

      // Classify payment
      const p = (sale.paymentMethod || '').toUpperCase();
      let key = 'OUTROS';
      if (p.includes('PIX')) key = 'PIX';
      else if (p.includes('CRÉDITO') || p.includes('CREDITO')) key = 'CRÉDITO';
      else if (p.includes('DÉBITO') || p.includes('DEBITO')) key = 'DÉBITO';
      else if (p.includes('DINHEIRO')) key = 'DINHEIRO';
      else if (p.includes('FATURADO') || p.includes('BOLETO')) key = 'FATURADO';

      paymentCounts[key] = (paymentCounts[key] || 0) + 1;
    });

    const averageTicket = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;

    let dominantPayment = 'Nenhum';
    let maxCount = 0;
    Object.entries(paymentCounts).forEach(([k, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantPayment = k;
      }
    });

    return {
      totalRevenue,
      totalDiscount,
      totalTickets: filteredSales.length,
      averageTicket,
      totalItemsCount,
      dominantPayment,
      dominantPaymentCount: maxCount,
    };
  }, [filteredSales]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (paymentFilter !== 'todos') count++;
    if (datePreset !== 'todos') count++;
    if (operatorFilter !== 'todos') count++;
    return count;
  }, [searchQuery, paymentFilter, datePreset, operatorFilter]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setPaymentFilter('todos');
    setDatePreset('todos');
    setStartDate('');
    setEndDate('');
    setOperatorFilter('todos');
  };

  // Helper for Payment Badge
  const renderPaymentBadge = (method: string) => {
    const m = (method || '').toUpperCase();
    if (m.includes('PIX')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e0f7f6] text-[#00687a] border border-[#a0ded9]">
          <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
          {method}
        </span>
      );
    }
    if (m.includes('CRÉDITO') || m.includes('CREDITO')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e7eeff] text-[#0f2744] border border-[#cbdcf8]">
          <span className="material-symbols-outlined text-[14px]">credit_card</span>
          {method}
        </span>
      );
    }
    if (m.includes('DÉBITO') || m.includes('DEBITO')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f0f4f8] text-[#1e3a5f] border border-[#d0dbe8]">
          <span className="material-symbols-outlined text-[14px]">payment</span>
          {method}
        </span>
      );
    }
    if (m.includes('DINHEIRO')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]">
          <span className="material-symbols-outlined text-[14px]">payments</span>
          {method}
        </span>
      );
    }
    if (m.includes('FATURADO') || m.includes('BOLETO')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
          {method}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f1f3f9] text-[#44474d] border border-[#c4c6ce]">
        <span className="material-symbols-outlined text-[14px]">point_of_sale</span>
        {method}
      </span>
    );
  };

  // Copy Access Key to clipboard
  const handleCopyAccessKey = (key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(key.replace(/\s/g, ''));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  // Export filtered sales as CSV
  const handleExportCSV = () => {
    if (filteredSales.length === 0) {
      alert('Nenhuma venda para exportar com os filtros atuais.');
      return;
    }

    const headers = [
      'Pedido',
      'Comprovante',
      'Data/Hora',
      'Cliente',
      'Documento',
      'Forma Pagamento',
      'Subtotal (R$)',
      'Desconto (R$)',
      'Total (R$)',
      'Operador',
      'Qtd Itens',
    ];

    const rows = filteredSales.map((s) => [
      s.orderNumber || s.id || '',
      'Cupom Não Fiscal',
      s.timestamp || '',
      `"${(s.client?.name || '').replace(/"/g, '""')}"`,
      `"${s.client?.doc || ''}"`,
      `"${s.paymentMethod || ''}"`,
      (s.subtotal || 0).toFixed(2),
      (s.discount || 0).toFixed(2),
      (s.total || 0).toFixed(2),
      `"${s.operatorName || ''}"`,
      s.items?.length || 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Historico_Vendas_Nao_Fiscal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* SECTION HEADER & QUICK ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#c4c6ce]/40 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#00687a] text-2xl">receipt_long</span>
            <h1 className="text-xl font-bold text-[#001229] tracking-tight">Histórico de Vendas & Comprovantes</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#acedff] text-[#004e5c] border border-[#57dffe]/40">
              Cupom Não Fiscal
            </span>
          </div>
          <p className="text-xs text-[#44474d]">
            Auditoria de cupons não fiscais emitidos no balcão, telemetria de vendas, controle por cliente e formas de pagamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[#c4c6ce]/60 bg-white text-[#0f2744] hover:bg-[#f0f3ff] transition-all cursor-pointer shadow-2xs"
            title="Exportar planilha CSV com todos os dados filtrados"
          >
            <span className="material-symbols-outlined text-base text-[#00687a]">download</span>
            Exportar CSV
          </button>

          {onNavigateToPDV && (
            <button
              onClick={onNavigateToPDV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#00687a] text-white hover:bg-[#004e5c] transition-all cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-base">point_of_sale</span>
              Nova Venda PDV (F2)
            </button>
          )}
        </div>
      </div>

      {/* BENTO KPI TELEMETRY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1: Faturamento Filtrado */}
        <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs relative overflow-hidden group hover:border-[#00687a] transition-all">
          <div className="flex items-center justify-between text-xs text-[#44474d] mb-1 font-medium">
            <span>Faturamento Filtrado</span>
            <span className="p-1.5 rounded-md bg-[#e7eeff] text-[#00687a]">
              <span className="material-symbols-outlined text-base">attach_money</span>
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-[#001229]">
            R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-[#74777e] flex items-center gap-1">
            <span>Volume de </span>
            <span className="font-semibold text-[#00687a]">{metrics.totalTickets} notas emitidas</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00687a] rounded-b-xl opacity-75" />
        </div>

        {/* KPI 2: Ticket Médio */}
        <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs relative overflow-hidden group hover:border-[#0f2744] transition-all">
          <div className="flex items-center justify-between text-xs text-[#44474d] mb-1 font-medium">
            <span>Ticket Médio</span>
            <span className="p-1.5 rounded-md bg-[#f0f3ff] text-[#0f2744]">
              <span className="material-symbols-outlined text-base">calculate</span>
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-[#001229]">
            R$ {metrics.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-[#74777e] flex items-center gap-1">
            <span>Média por transação efetuada</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0f2744] rounded-b-xl opacity-75" />
        </div>

        {/* KPI 3: Descontos Aplicados */}
        <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs relative overflow-hidden group hover:border-amber-600 transition-all">
          <div className="flex items-center justify-between text-xs text-[#44474d] mb-1 font-medium">
            <span>Descontos Concedidos</span>
            <span className="p-1.5 rounded-md bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-base">percent</span>
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-700">
            R$ {metrics.totalDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-[#74777e]">
            {metrics.totalRevenue > 0
              ? `${((metrics.totalDiscount / (metrics.totalRevenue + metrics.totalDiscount)) * 100).toFixed(1)}% do faturamento bruto`
              : 'Sem descontos'}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-b-xl opacity-75" />
        </div>

        {/* KPI 4: Método Mais Usado */}
        <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs relative overflow-hidden group hover:border-[#166534] transition-all">
          <div className="flex items-center justify-between text-xs text-[#44474d] mb-1 font-medium">
            <span>Método Mais Utilizado</span>
            <span className="p-1.5 rounded-md bg-emerald-50 text-emerald-700">
              <span className="material-symbols-outlined text-base">payments</span>
            </span>
          </div>
          <div className="text-xl font-bold text-[#001229] truncate">
            {metrics.dominantPayment}
          </div>
          <div className="mt-1 text-[11px] text-[#74777e]">
            {metrics.dominantPaymentCount} vendas ({metrics.totalTickets > 0 ? Math.round((metrics.dominantPaymentCount / metrics.totalTickets) * 100) : 0}% do total)
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#166534] rounded-b-xl opacity-75" />
        </div>
      </div>

      {/* ADVANCED FILTER TOOLBAR */}
      <div className="bg-white p-5 rounded-2xl border border-[#c4c6ce]/40 shadow-xs space-y-4">
        {/* Row 1: Search Input & Quick Date Presets */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Real-time search input for Customer Name, Document, Order # or NFC-e */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#74777e] text-lg">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome do cliente, CPF/CNPJ, pedido (PED-...) ou NFC-e..."
              className="w-full pl-10 pr-9 py-2.5 text-xs bg-[#f8f9ff] border border-[#c4c6ce]/60 rounded-xl focus:outline-none focus:border-[#00687a] focus:bg-white text-[#001229] transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#74777e] hover:text-[#001229] text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Range Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-xs font-semibold text-[#44474d] mr-1 hidden sm:inline">Período:</span>
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'hoje', label: 'Hoje' },
                { id: 'ontem', label: 'Ontem' },
                { id: '7dias', label: '7 dias' },
                { id: '30dias', label: '30 dias' },
                { id: 'custom', label: 'Personalizado' },
              ] as { id: DatePreset; label: string }[]
            ).map((preset) => (
              <button
                key={preset.id}
                onClick={() => setDatePreset(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  datePreset === preset.id
                    ? 'bg-[#00687a] text-white shadow-2xs'
                    : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Custom Date Inputs (when 'custom' preset is selected) */}
        {datePreset === 'custom' && (
          <div className="p-3 bg-[#f0f4f8] rounded-xl border border-[#c4c6ce]/50 flex flex-wrap items-center gap-3 text-xs animate-fadeIn">
            <span className="font-semibold text-[#001229] flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-[#00687a]">date_range</span>
              Intervalo de Datas:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-[#44474d]">De:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs border border-[#c4c6ce] rounded-lg bg-white text-[#001229] focus:outline-none focus:border-[#00687a]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[#44474d]">Até:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs border border-[#c4c6ce] rounded-lg bg-white text-[#001229] focus:outline-none focus:border-[#00687a]"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-[11px] text-red-600 hover:underline font-semibold"
              >
                Limpar datas
              </button>
            )}
          </div>
        )}

        {/* Row 3: Payment Method Filter Chips & Operator Select */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-[#c4c6ce]/30">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-[#44474d] mr-1">Pagamento:</span>
            {(
              [
                { id: 'todos', label: 'Todos', icon: 'all_inclusive' },
                { id: 'pix', label: 'PIX', icon: 'qr_code_2' },
                { id: 'credito', label: 'Cartão Crédito', icon: 'credit_card' },
                { id: 'debito', label: 'Cartão Débito', icon: 'payment' },
                { id: 'dinheiro', label: 'Dinheiro', icon: 'payments' },
                { id: 'faturado', label: 'Faturado / Boleto', icon: 'receipt_long' },
              ] as { id: PaymentFilter; label: string; icon: string }[]
            ).map((filter) => (
              <button
                key={filter.id}
                onClick={() => setPaymentFilter(filter.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  paymentFilter === filter.id
                    ? 'bg-[#0f2744] text-white shadow-2xs'
                    : 'bg-[#f8f9ff] text-[#44474d] hover:bg-[#eef2ff] border border-[#c4c6ce]/40'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">{filter.icon}</span>
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Operator Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#44474d]">Operador:</label>
              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="px-2.5 py-1 text-xs border border-[#c4c6ce]/60 rounded-lg bg-white text-[#001229] focus:outline-none focus:border-[#00687a]"
              >
                <option value="todos">Todos os Operadores</option>
                {uniqueOperators.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear All Filters Button */}
            {activeFiltersCount > 0 && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                title="Redefinir todos os filtros"
              >
                <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                Limpar ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FILTER FEEDBACK BANNER */}
      <div className="flex items-center justify-between text-xs text-[#74777e] px-1">
        <div>
          Exibindo <span className="font-bold text-[#001229] font-mono">{filteredSales.length}</span> de{' '}
          <span className="font-mono">{sales.length}</span> cupons emitidos
          {searchQuery && (
            <span>
              {' '}
              filtrados por busca <strong className="text-[#00687a]">"{searchQuery}"</strong>
            </span>
          )}
        </div>
        <div className="hidden sm:block text-[11px]">
          Toque em uma venda para inspecionar DANFE NFC-e e itens emitidos
        </div>
      </div>

      {/* SALES DETAILED LIST / TABLE */}
      {filteredSales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#c4c6ce]/40 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#f0f3ff] text-[#00687a] flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl">receipt_long</span>
          </div>
          <h3 className="text-base font-bold text-[#001229] mb-1">Nenhum cupom de venda encontrado</h3>
          <p className="text-xs text-[#74777e] max-w-md mx-auto mb-5">
            Não encontramos registros para os critérios e filtros selecionados. Tente ajustar o período, a forma de pagamento ou a busca por cliente.
          </p>
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 rounded-lg bg-[#00687a] text-white text-xs font-bold hover:bg-[#004e5c] transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Redefinir Filtros
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8f9ff] border-b border-[#c4c6ce]/40 text-[11px] font-bold text-[#44474d] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Pedido / Cupom</th>
                  <th className="py-3.5 px-4">Data & Horário</th>
                  <th className="py-3.5 px-4">Cliente / Documento</th>
                  <th className="py-3.5 px-4">Resumo dos Itens</th>
                  <th className="py-3.5 px-4">Forma de Pagamento</th>
                  <th className="py-3.5 px-4 text-right">Subtotal & Desconto</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                  <th className="py-3.5 px-4 text-center">Operador</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c4c6ce]/30 text-xs text-[#001229]">
                {filteredSales.map((sale) => {
                  const itemCount = sale.items?.reduce((acc, it) => acc + (it.quantity || 1), 0) || 0;
                  const firstItem = sale.items?.[0]?.product?.name || 'Itens diversos';

                  return (
                    <tr
                      key={sale.id || sale.orderNumber}
                      className="hover:bg-[#f0f3ff]/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedSale(sale)}
                    >
                      {/* Pedido & Comprovante */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-[#00687a] flex items-center gap-1">
                          <span>{sale.orderNumber || 'PED-48900'}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#74777e] flex items-center gap-1 mt-0.5">
                          <span>Cupom Não Fiscal</span>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Venda finalizada no balcão" />
                        </div>
                      </td>

                      {/* Data & Horário */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-[#001229]">
                          {sale.timestamp?.split(' ')[0] || 'Hoje'}
                        </div>
                        <div className="text-[11px] font-mono text-[#74777e]">
                          {sale.timestamp?.split(' ')[1] || '14:00'}
                        </div>
                      </td>

                      {/* Cliente / Documento */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#001229] truncate max-w-[200px]" title={sale.client?.name}>
                          {sale.client?.name || 'Consumidor Balcão'}
                        </div>
                        <div className="text-[11px] text-[#74777e] flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{sale.client?.doc || '000.000.000-00'}</span>
                          {sale.client?.segment && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-[#eef2ff] text-[#0f2744]">
                              {sale.client.segment}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Resumo dos Itens */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-[#001229] truncate max-w-[220px]" title={firstItem}>
                          {firstItem}
                        </div>
                        <div className="text-[11px] text-[#74777e] mt-0.5 flex items-center gap-1">
                          <span className="font-semibold text-[#00687a]">
                            {itemCount} {itemCount === 1 ? 'volume' : 'volumes'}
                          </span>
                          {sale.items && sale.items.length > 1 && (
                            <span>(+{sale.items.length - 1} outros produtos)</span>
                          )}
                        </div>
                      </td>

                      {/* Forma de Pagamento */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderPaymentBadge(sale.paymentMethod)}
                      </td>

                      {/* Subtotal & Desconto */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                        <div className="text-[#44474d]">
                          R$ {(sale.subtotal || sale.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        {sale.discount > 0 ? (
                          <div className="text-[11px] text-amber-700 font-semibold">
                            -R$ {sale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {sale.couponCode && ` (${sale.couponCode})`}
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#c4c6ce]">sem desconto</div>
                        )}
                      </td>

                      {/* Valor Total */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                        <div className="text-sm font-bold text-[#001229]">
                          R$ {sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[10px] text-emerald-700 font-bold">Liquidado</span>
                      </td>

                      {/* Operador */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#f0f3ff] text-[#0f2744]">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          {sale.operatorName?.split(' ')[0] || 'Marcos'}
                        </span>
                      </td>

                      {/* Ações */}
                      <td
                        className="py-3.5 px-4 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedSale(sale)}
                            className="p-1.5 rounded-lg text-[#00687a] hover:bg-[#e7eeff] transition-colors"
                            title="Ver detalhes completos do cupom e itens"
                          >
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintReceiptSale(sale)}
                            className="p-1.5 rounded-lg text-[#0f2744] hover:bg-[#dee8ff] transition-colors"
                            title="Imprimir 2ª via / Comprovante fiscal"
                          >
                            <span className="material-symbols-outlined text-lg">print</span>
                          </button>

                          {onNavigateToPDVWithItems && sale.items && sale.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => onNavigateToPDVWithItems(sale.items)}
                              className="p-1.5 rounded-lg text-[#166534] hover:bg-emerald-50 transition-colors"
                              title="Repetir venda: carregar itens no PDV"
                            >
                              <span className="material-symbols-outlined text-lg">replay</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}
          <div className="p-4 bg-[#f8f9ff] border-t border-[#c4c6ce]/40 flex flex-col sm:flex-row items-center justify-between text-xs text-[#44474d] gap-2">
            <div>
              Mostrando <strong className="text-[#001229]">{filteredSales.length}</strong> cupons fiscais
            </div>
            <div className="flex items-center gap-4 font-mono">
              <div>
                Subtotal:{' '}
                <span className="font-bold text-[#001229]">
                  R${' '}
                  {filteredSales
                    .reduce((acc, s) => acc + (s.subtotal || s.total), 0)
                    .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                Total Líquido:{' '}
                <span className="font-bold text-[#00687a] text-sm">
                  R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: DETALHES COMPLETOS DA VENDA (DANFE NFC-e + AUDITORIA) */}
      {selectedSale && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedSale(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-[#c4c6ce]/40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#57dffe]">
                  <span className="material-symbols-outlined text-2xl">receipt_long</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Detalhes da Venda {selectedSale.orderNumber || 'PED-48920'}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Cupom Não Fiscal
                    </span>
                  </div>
                  <p className="text-xs text-white/70">
                    Emitido em {selectedSale.timestamp} • Operador {selectedSale.operatorName || 'Marcos Silva'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPrintReceiptSale(selectedSale)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  Imprimir Comprovante
                </button>
                <button
                  onClick={() => setSelectedSale(null)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body - 2 Columns */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#f8f9ff]">
              {/* Left Column: Non-Fiscal Receipt Simulation (7 cols) */}
              <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-[#c4c6ce]/40 shadow-xs space-y-4 font-sans text-xs">
                {/* Store Header */}
                <div className="text-center pb-3 border-b border-dashed border-[#c4c6ce]">
                  <h3 className="font-bold text-[#001229] text-sm uppercase tracking-wide">
                    {STORE_CONFIG.name}
                  </h3>
                  <p className="text-[11px] text-[#74777e] font-semibold">
                    CNPJ: {STORE_CONFIG.cnpj}
                  </p>
                  <p className="text-[11px] text-[#74777e]">
                    {STORE_CONFIG.address} - {STORE_CONFIG.neighborhood}
                  </p>
                  <p className="text-[11px] text-[#74777e]">
                    {STORE_CONFIG.city} - {STORE_CONFIG.state} • Fone: {STORE_CONFIG.phone}
                  </p>
                  <div className="inline-block mt-1.5 px-2.5 py-0.5 rounded bg-[#f0f3ff] text-[#00687a] font-mono text-[10px] font-bold">
                    *** CUPOM NÃO FISCAL *** — COMPROVANTE DE VENDA
                  </div>
                </div>

                {/* Non-Fiscal Document Control */}
                <div className="p-3 bg-[#f8f9ff] rounded-lg border border-[#c4c6ce]/40 space-y-1.5 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#74777e]">Pedido / Venda:</span>
                    <span className="font-mono font-bold text-[#001229]">
                      {selectedSale.orderNumber || 'PED-48920'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#74777e]">Data de Emissão:</span>
                    <span className="font-mono text-[#00687a] font-semibold">
                      {selectedSale.timestamp}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#74777e]">Operador de Caixa:</span>
                    <span className="font-semibold text-[#001229]">
                      {selectedSale.operatorName || 'Marcos Silva'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-[#c4c6ce]/40 text-[10px] text-[#74777e]">
                    <span>Natureza:</span>
                    <span className="font-bold text-[#0f2744]">Venda Balcão / Não Fiscal</span>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div>
                  <h4 className="font-bold text-[#001229] text-xs uppercase mb-2 flex items-center justify-between">
                    <span>Itens do Pedido ({selectedSale.items?.length || 0})</span>
                    <span className="text-[11px] text-[#74777e] font-normal">Valores em R$</span>
                  </h4>
                  <div className="border border-[#c4c6ce]/40 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#f0f3ff] text-[#44474d] font-bold">
                        <tr>
                          <th className="py-2 px-2.5">Código / Descrição</th>
                          <th className="py-2 px-2 text-center">Qtd</th>
                          <th className="py-2 px-2 text-right">Unitário</th>
                          <th className="py-2 px-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4c6ce]/20">
                        {selectedSale.items && selectedSale.items.length > 0 ? (
                          selectedSale.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-[#f8f9ff]">
                              <td className="py-2 px-2.5">
                                <div className="font-bold text-[#001229]">{item.product.name}</div>
                                <div className="text-[10px] text-[#74777e] font-mono">
                                  SKU: {item.product.sku} • {item.product.brand}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-center font-mono font-semibold">
                                {item.quantity} {item.product.stockUnit || 'un'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-[#44474d]">
                                R$ {item.product.price.toFixed(2)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-[#001229]">
                                R$ {(item.product.price * item.quantity).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-3 text-center text-[#74777e]">
                              Itens gravados no cupom fiscal sintético
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Subtotals & Payment Calculation */}
                <div className="pt-2 border-t border-dashed border-[#c4c6ce] space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-[#44474d]">
                    <span>Subtotal Bruto:</span>
                    <span>R$ {(selectedSale.subtotal || selectedSale.total).toFixed(2)}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div className="flex justify-between text-amber-700 font-semibold">
                      <span>Desconto Especial {selectedSale.couponCode ? `(${selectedSale.couponCode})` : ''}:</span>
                      <span>-R$ {selectedSale.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-[#001229] pt-1 border-t border-[#c4c6ce]">
                    <span className="font-sans">VALOR TOTAL:</span>
                    <span className="text-[#00687a]">R$ {selectedSale.total.toFixed(2)}</span>
                  </div>

                  <div className="p-2.5 bg-[#f0fdf4] rounded-lg border border-emerald-200 mt-2 space-y-1 text-[11px] text-emerald-950 font-sans">
                    <div className="flex justify-between items-center font-semibold">
                      <span>Forma de Pagamento:</span>
                      <span className="font-mono text-emerald-800">{selectedSale.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-emerald-800 font-mono">
                      <span>Valor Recebido:</span>
                      <span>R$ {(selectedSale.receivedAmount || selectedSale.total).toFixed(2)}</span>
                    </div>
                    {(selectedSale.changeAmount || 0) > 0 && (
                      <div className="flex justify-between text-[11px] text-emerald-800 font-mono font-bold">
                        <span>Troco Devolvido:</span>
                        <span>R$ {selectedSale.changeAmount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Customer Details, Audit & Actions (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Client Profile Card */}
                <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#c4c6ce]/30">
                    <span className="material-symbols-outlined text-[#00687a] text-lg">person</span>
                    <h4 className="font-bold text-[#001229] text-xs uppercase">Dados do Cliente</h4>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-[11px] text-[#74777e] block">Razão Social / Nome:</span>
                      <span className="font-bold text-[#001229]">{selectedSale.client?.name || 'Consumidor Final'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#74777e] block">Documento:</span>
                        <span className="font-mono font-semibold text-[#001229]">
                          {selectedSale.client?.doc || 'Não informado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#74777e] block">Segmento:</span>
                        <span className="font-medium text-[#0f2744]">
                          {selectedSale.client?.segment || 'Balcão Varejo'}
                        </span>
                      </div>
                    </div>
                    {selectedSale.client?.phone && (
                      <div className="text-[11px]">
                        <span className="text-[#74777e] block">Telefone:</span>
                        <span className="font-mono text-[#001229]">{selectedSale.client.phone}</span>
                      </div>
                    )}
                    {selectedSale.client?.paymentTerm && (
                      <div className="text-[11px]">
                        <span className="text-[#74777e] block">Condição Cadastrada:</span>
                        <span className="text-[#00687a] font-semibold">{selectedSale.client.paymentTerm}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit & Terminal Trail */}
                <div className="bg-white p-4 rounded-xl border border-[#c4c6ce]/40 shadow-xs space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#c4c6ce]/30">
                    <span className="material-symbols-outlined text-[#00687a] text-lg">store</span>
                    <h4 className="font-bold text-[#001229] text-xs uppercase">Dados do Estabelecimento & Balcão</h4>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#74777e]">Terminal PDV:</span>
                      <span className="font-bold text-[#001229]">Terminal #01 (Principal)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#74777e]">Operador Caixa:</span>
                      <span className="font-semibold text-[#0f2744]">{selectedSale.operatorName || 'Marcos Silva'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#74777e]">Tipo de Comprovante:</span>
                      <span className="text-emerald-700 font-bold">Cupom Não Fiscal</span>
                    </div>
                    <div className="pt-1 border-t border-[#c4c6ce]/30 text-[#74777e]">
                      <div>{STORE_CONFIG.fullAddress}</div>
                      <div>CNPJ: {STORE_CONFIG.cnpj} • Tel: {STORE_CONFIG.phone}</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => setPrintReceiptSale(selectedSale)}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#00687a] text-white text-xs font-bold hover:bg-[#004e5c] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">print</span>
                    Imprimir Comprovante Não Fiscal
                  </button>

                  {onNavigateToPDVWithItems && selectedSale.items && selectedSale.items.length > 0 && (
                    <button
                      onClick={() => {
                        onNavigateToPDVWithItems(selectedSale.items);
                        setSelectedSale(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#0f2744] text-white text-xs font-bold hover:bg-[#1a3d68] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">shopping_cart_checkout</span>
                      Clonar Itens para Nova Venda
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedSale(null)}
                    className="w-full py-2 px-4 rounded-xl bg-white border border-[#c4c6ce]/60 text-[#44474d] text-xs font-semibold hover:bg-[#f0f3ff] transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: COMPROVANTE NÃO FISCAL PARA IMPRESSÃO */}
      {printReceiptSale && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPrintReceiptSale(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#c4c6ce]/40 flex flex-col space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#c4c6ce]/30">
              <h3 className="font-bold text-[#001229] text-sm flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#00687a]">print</span>
                Comprovante Não Fiscal — Visualização
              </h3>
              <button
                onClick={() => setPrintReceiptSale(null)}
                className="text-[#74777e] hover:text-[#001229] text-base"
              >
                ✕
              </button>
            </div>

            {/* Thermal Printer Paper Style Preview */}
            <div className="bg-[#fffdf7] p-4 rounded-lg border border-dashed border-[#c4c6ce] font-mono text-[11px] text-[#001229] space-y-2 max-h-[60vh] overflow-y-auto">
              <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-[#c4c6ce]">
                <div className="font-bold text-xs uppercase">{STORE_CONFIG.name}</div>
                <div className="text-[10px] text-[#44474d] font-bold">CNPJ: {STORE_CONFIG.cnpj}</div>
                <div className="text-[10px] text-[#74777e]">{STORE_CONFIG.address}</div>
                <div className="text-[10px] text-[#74777e]">{STORE_CONFIG.neighborhood} - {STORE_CONFIG.city}/{STORE_CONFIG.state}</div>
                <div className="text-[10px] text-[#74777e]">Telefone: {STORE_CONFIG.phone}</div>
                <div className="text-[10px] font-bold text-[#00687a] mt-1 pt-1 border-t border-dotted border-[#aaa]">
                  *** CUPOM NÃO FISCAL ***
                </div>
                <div className="text-[9px] text-[#74777e]">NÃO É DOCUMENTO FISCAL</div>
              </div>

              <div className="text-[10px] space-y-0.5">
                <div>Pedido: {printReceiptSale.orderNumber || 'PED-48920'}</div>
                <div>Data/Hora: {printReceiptSale.timestamp}</div>
                <div>Cliente: {printReceiptSale.client?.name || 'Consumidor'}</div>
                <div>Doc: {printReceiptSale.client?.doc || '000.000.000-00'}</div>
              </div>

              <div className="py-2 border-t border-b border-dashed border-[#c4c6ce] space-y-1">
                <div className="font-bold text-[10px] text-[#74777e] flex justify-between">
                  <span>ITEM / DESCRIÇÃO</span>
                  <span>TOTAL</span>
                </div>
                {printReceiptSale.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[10px]">
                    <div className="truncate max-w-[200px]">
                      {it.quantity}x {it.product.name}
                    </div>
                    <div>R$ {(it.product.price * it.quantity).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-right text-xs">
                <div className="flex justify-between text-[#74777e]">
                  <span>Subtotal:</span>
                  <span>R$ {(printReceiptSale.subtotal || printReceiptSale.total).toFixed(2)}</span>
                </div>
                {printReceiptSale.discount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Desconto:</span>
                    <span>-R$ {printReceiptSale.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-[#001229] pt-1 border-t border-[#c4c6ce]">
                  <span>TOTAL R$:</span>
                  <span>{printReceiptSale.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-[#00687a]">
                  <span>Forma Pagamento:</span>
                  <span>{printReceiptSale.paymentMethod}</span>
                </div>
              </div>

              <div className="text-center pt-2 border-t border-dashed border-[#c4c6ce] text-[9px] text-[#74777e] space-y-1">
                <div>{STORE_CONFIG.policyNotice}</div>
                <div>Controle: {printReceiptSale.orderNumber || 'PED-48920'}</div>
                <div className="font-bold text-[#001229] pt-1">{STORE_CONFIG.name} • Obrigado pela preferência!</div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-[#00687a] text-white text-xs font-bold hover:bg-[#004e5c] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Imprimir Agora
              </button>
              <button
                onClick={() => setPrintReceiptSale(null)}
                className="py-2 px-4 rounded-lg border border-[#c4c6ce]/60 text-xs font-semibold text-[#44474d] hover:bg-[#f0f3ff]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
