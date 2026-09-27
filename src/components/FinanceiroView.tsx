import React, { useState } from 'react';
import { ScheduleItem, DREData } from '../types';

interface FinanceiroViewProps {
  scheduleItems: ScheduleItem[];
  onOpenNewExpenseModal: () => void;
  dreData: DREData;
  onUpdateDRE: (newDre: DREData) => void;
  onOpenImportModal: () => void;
}

export const FinanceiroView: React.FC<FinanceiroViewProps> = ({
  scheduleItems,
  onOpenNewExpenseModal,
  dreData,
  onUpdateDRE,
  onOpenImportModal,
}) => {
  const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes' | 'trimestre' | 'ano'>('mes');
  const [items, setItems] = useState<ScheduleItem[]>(scheduleItems);

  // Sync items when parent updates them
  React.useEffect(() => {
    setItems(scheduleItems);
  }, [scheduleItems]);

  // Derived DRE Calculations
  const receitaLiquida = Math.max(0, dreData.faturamentoBruto - dreData.deducoesImpostos);
  const lucroBruto = receitaLiquida - dreData.cmv;
  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
  const despesasOperacionais =
    dreData.despesasPessoal +
    dreData.despesasLogistica +
    dreData.despesasFinanceiras;
  const ebitda = lucroBruto - despesasOperacionais;
  const lucroLiquido = ebitda - dreData.depreciacao - (dreData.outrasDespesas || 0) + (dreData.outrasReceitas || 0);
  const margemLiquida = dreData.faturamentoBruto > 0 ? (lucroLiquido / dreData.faturamentoBruto) * 100 : 0;

  const handlePayItem = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          statusText: 'Liquidado Hoje',
          statusColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
        };
      }
      return item;
    }));
    alert('Título liquidado e comprovante de quitação bancária anexado.');
  };

  return (
    <div className="space-y-6 select-none">
      {/* PAGE TITLE & MODULE CONTROLS HEADER */}
      <section className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-bold text-[#001229] tracking-tight">
              Módulo Financeiro & Fluxo de Caixa
            </h1>
            <span className="bg-[#57dffe]/30 text-[#004e5c] text-xs px-2.5 py-0.5 rounded-full font-bold">
              Exercício {dreData.exercicio || '2023'}
            </span>
            {dreData.sourceFileName && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-[#00687a] bg-[#e7eeff] px-2 py-0.5 rounded border border-[#dee8ff]">
                <span className="material-symbols-outlined text-xs">sync</span>
                {dreData.sourceFileName}
              </span>
            )}
          </div>
          <p className="text-xs text-[#44474d] mt-0.5 max-w-4xl">
            Visão unificada de contas a pagar, contas a receber, conciliação bancária, despesas com fornecedores de tintas (Suvinil, Coral, Lukscolor) e DRE gerencial alimentado por planilhas, PDFs, CSVs e Markdown.
          </p>
        </div>

        {/* Action Buttons & Dynamic Period Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 bg-[#f0f3ff] border border-[#c4c6ce]/60 rounded-lg shadow-xs text-xs font-semibold">
            {(['hoje', 'semana', 'mes', 'trimestre', 'ano'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  period === p
                    ? 'bg-white text-[#001229] shadow-xs font-bold'
                    : 'text-[#44474d] hover:text-[#001229]'
                }`}
              >
                {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Esta Semana' : p === 'mes' ? 'Este Mês' : p === 'trimestre' ? 'Trimestre' : 'Ano'}
              </button>
            ))}
          </div>

          {/* MAIN IMPORT BUTTON: PLANILHA / PDF / CSV / MD */}
          <button
            onClick={onOpenImportModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#00687a] hover:bg-[#004e5c] text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer ring-2 ring-[#57dffe]/40"
            title="Importar Planilhas Excel (.xlsx), Relatórios PDF, Arquivos CSV ou Tabelas Markdown (.md)"
          >
            <span className="material-symbols-outlined text-base text-[#57dffe]">upload_file</span>
            <span>Importar Planilha / PDF / CSV / MD</span>
          </button>

          <button
            onClick={() => alert('Arquivo OFX de extrato bancário importado e conciliado com 100% de paridade.')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c4c6ce] hover:bg-[#f0f3ff] text-[#001229] font-semibold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-[#00687a]">receipt_long</span>
            <span>Conciliar Extrato OFX</span>
          </button>

          <button
            onClick={() => alert('Relatório DRE exportado em formato contábil oficial.')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c4c6ce] hover:bg-[#f0f3ff] text-[#001229] font-semibold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-[#00687a]">summarize</span>
            <span>Gerar Relatório DRE</span>
          </button>

          <button
            onClick={onOpenNewExpenseModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0f2744] text-white hover:bg-[#001229] transition-all font-bold text-xs rounded-lg shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-[#57dffe]">add_card</span>
            <span>+ Nova Despesa/Pagamento</span>
          </button>
        </div>
      </section>


      {/* 4 TOP FINANCIAL INDICATOR CARDS */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Saldo Geral em Contas */}
        <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-[#00687a]/40 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#44474d] font-bold">
                Saldo Geral em Contas
              </span>
              <div className="text-[22px] font-mono font-bold text-[#001229] mt-1 tracking-tight">
                R$ {dreData.saldoGeralContas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#f0f3ff] flex items-center justify-center text-[#00687a] border border-[#c4c6ce]/30">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs text-[#44474d]">
            <span className="truncate">Itaú, Bradesco, Santander & Caixa</span>
            <span className="text-emerald-700 font-mono text-xs font-semibold flex items-center gap-0.5">
              <span className="material-symbols-outlined text-xs">trending_up</span> +3.2%
            </span>
          </div>
        </div>

        {/* Card 2: Contas a Receber (Mês) */}
        <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-[#00687a]/40 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#44474d] font-bold">
                Contas a Receber (Mês)
              </span>
              <div className="text-[22px] font-mono font-bold text-emerald-700 mt-1 tracking-tight">
                R$ {dreData.contasAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 border border-emerald-200">
              <span className="material-symbols-outlined text-xl">call_received</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs text-[#44474d]">
            <span className="truncate">94% faturado em dia</span>
            <span className="px-2 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
              Saudável
            </span>
          </div>
        </div>

        {/* Card 3: Contas a Pagar (Mês) */}
        <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-[#00687a]/40 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#44474d] font-bold">
                Contas a Pagar (Mês)
              </span>
              <div className="text-[22px] font-mono font-bold text-[#ba1a1a] mt-1 tracking-tight">
                R$ {dreData.contasAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#ffdad6]/40 flex items-center justify-center text-[#ba1a1a] border border-[#ffdad6]">
              <span className="material-symbols-outlined text-xl">call_made</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs text-[#44474d]">
            <span className="truncate">Fornecedores bases & pigmentos</span>
            <span className="font-mono text-xs text-[#44474d]">18 títulos</span>
          </div>
        </div>

        {/* Card 4: Lucro Líquido Operacional */}
        <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-[#00687a]/40 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#44474d] font-bold">
                Lucro Líquido Operacional
              </span>
              <div className="text-[22px] font-mono font-bold text-[#001229] mt-1 tracking-tight">
                R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#57dffe]/20 flex items-center justify-center text-[#00687a] border border-[#57dffe]/40">
              <span className="material-symbols-outlined text-xl">query_stats</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs">
            <span className="text-[#44474d]">Margem calculada:</span>
            <span className={`px-2 py-0.2 rounded-full text-xs font-bold font-mono flex items-center gap-1 ${
              lucroLiquido >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              <span className="material-symbols-outlined text-xs">
                {lucroLiquido >= 0 ? 'check_circle' : 'warning'}
              </span>
              {margemLiquida.toFixed(1)}% {lucroLiquido >= 0 ? 'Positivo' : 'Abaixo'}
            </span>
          </div>
        </div>
      </section>


      {/* CENTRAL SPLIT WORKSPACE (60% ESQUERDA / 40% DIREITA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Card 1: Gráfico de Fluxo de Caixa */}
          <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#c4c6ce]/30 gap-2">
              <div>
                <h2 className="text-[16px] font-bold text-[#001229] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00687a]">show_chart</span>
                  Fluxo de Caixa Diário: Projetado vs. Realizado
                </h2>
                <p className="text-xs text-[#44474d]">
                  Comparativo de entradas vs. saídas de capital nos últimos 14 dias operacionais
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
                  <span className="text-[#44474d]">Entradas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#ba1a1a]"></span>
                  <span className="text-[#44474d]">Saídas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#57dffe]"></span>
                  <span className="text-[#44474d]">Saldo Acum.</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Chart */}
            <div className="mt-4 relative h-64 w-full">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 680 230">
                {/* Horizontal Grid */}
                <line x1="40" y1="30" x2="670" y2="30" stroke="#f1f5f9" strokeDasharray="4 4" />
                <line x1="40" y1="75" x2="670" y2="75" stroke="#f1f5f9" strokeDasharray="4 4" />
                <line x1="40" y1="120" x2="670" y2="120" stroke="#f1f5f9" strokeDasharray="4 4" />
                <line x1="40" y1="165" x2="670" y2="165" stroke="#f1f5f9" strokeDasharray="4 4" />
                <line x1="40" y1="200" x2="670" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />

                {/* Y Axis Labels */}
                <text x="32" y="34" textAnchor="end" className="text-[10px] font-mono fill-slate-400">40k</text>
                <text x="32" y="79" textAnchor="end" className="text-[10px] font-mono fill-slate-400">30k</text>
                <text x="32" y="124" textAnchor="end" className="text-[10px] font-mono fill-slate-400">20k</text>
                <text x="32" y="169" textAnchor="end" className="text-[10px] font-mono fill-slate-400">10k</text>
                <text x="32" y="204" textAnchor="end" className="text-[10px] font-mono fill-slate-400">0</text>

                {/* Bar Groups */}
                <rect x="65" y="110" width="14" height="90" rx="2" fill="#10b981" />
                <rect x="81" y="145" width="14" height="55" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="125" y="90" width="14" height="110" rx="2" fill="#10b981" />
                <rect x="141" y="130" width="14" height="70" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="185" y="70" width="14" height="130" rx="2" fill="#10b981" />
                <rect x="201" y="160" width="14" height="40" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="245" y="100" width="14" height="100" rx="2" fill="#10b981" />
                <rect x="261" y="80" width="14" height="120" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="305" y="60" width="14" height="140" rx="2" fill="#10b981" />
                <rect x="321" y="140" width="14" height="60" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="365" y="50" width="14" height="150" rx="2" fill="#10b981" />
                <rect x="381" y="110" width="14" height="90" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                <rect x="425" y="65" width="14" height="135" rx="2" fill="#10b981" />
                <rect x="441" y="150" width="14" height="50" rx="2" fill="#ba1a1a" fillOpacity="0.85" />

                {/* Dia 24 Hoje */}
                <rect x="485" y="45" width="14" height="155" rx="2" fill="#00687a" />
                <rect x="501" y="105" width="14" height="95" rx="2" fill="#ba1a1a" />

                {/* Projeções */}
                <rect x="545" y="85" width="14" height="115" rx="2" fill="#10b981" fillOpacity="0.4" stroke="#10b981" strokeDasharray="2 2" />
                <rect x="561" y="130" width="14" height="70" rx="2" fill="#ba1a1a" fillOpacity="0.4" stroke="#ba1a1a" strokeDasharray="2 2" />

                <rect x="605" y="70" width="14" height="130" rx="2" fill="#10b981" fillOpacity="0.4" stroke="#10b981" strokeDasharray="2 2" />
                <rect x="621" y="95" width="14" height="105" rx="2" fill="#ba1a1a" fillOpacity="0.4" stroke="#ba1a1a" strokeDasharray="2 2" />

                {/* Saldo Curve */}
                <path d="M 75 140 Q 135 125, 195 105 T 315 85 T 435 70 T 555 60 T 630 50" fill="none" stroke="#57dffe" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="493" cy="65" r="4.5" fill="#0f2744" stroke="#57dffe" strokeWidth="2" />

                {/* X Labels */}
                <text x="75" y="218" textAnchor="middle" className="text-[10px] font-mono fill-slate-500">10/Out</text>
                <text x="195" y="218" textAnchor="middle" className="text-[10px] font-mono fill-slate-500">14/Out</text>
                <text x="315" y="218" textAnchor="middle" className="text-[10px] font-mono fill-slate-500">18/Out</text>
                <text x="435" y="218" textAnchor="middle" className="text-[10px] font-mono fill-slate-500">22/Out</text>
                <text x="495" y="218" textAnchor="middle" className="text-[10px] font-mono font-bold fill-[#001229]">Hoje (24)</text>
                <text x="615" y="218" textAnchor="middle" className="text-[10px] font-mono fill-slate-400">28/Out (P)</text>
              </svg>
            </div>

            <div className="mt-3 pt-3 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs">
              <span className="text-[#44474d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#00687a]">info</span>
                Projeção calculada com base em títulos emitidos e histórico de recorrência de tintas.
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[#44474d]">Ponto de Equilíbrio:</span>
                <span className="text-emerald-700 font-mono font-bold">Superado em 14/10</span>
              </div>
            </div>
          </div>

          {/* Card 2: Tabela de Previsão de Contas a Pagar & Receber da Semana */}
          <div className="bg-white border border-[#c4c6ce]/60 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 pb-3 border-b border-[#c4c6ce]/30 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-bold text-[#001229] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00687a]">calendar_month</span>
                  Previsão de Contas a Pagar & Receber da Semana
                </h2>
                <p className="text-xs text-[#44474d]">
                  Títulos operacionais pendentes de liquidação com vencimento nos próximos 7 dias
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#e7eeff] text-[#001229]">
                5 Títulos Críticos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f0f3ff]/70 border-b border-[#c4c6ce]/40 text-[11px] uppercase text-[#74777e] tracking-wider">
                    <th className="py-2.5 px-4 font-bold">Descrição / Contraparte</th>
                    <th className="py-2.5 px-3 font-bold">Vencimento</th>
                    <th className="py-2.5 px-3 font-bold">Categoria</th>
                    <th className="py-2.5 px-4 text-right font-bold">Valor Líquido</th>
                    <th className="py-2.5 px-4 text-center font-bold">Status Liquidação</th>
                    <th className="py-2.5 px-2 text-center font-bold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c4c6ce]/20">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-[#f0f3ff]/40 transition-colors ${!item.isExpense ? 'bg-emerald-50/20' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#001229]">{item.title}</div>
                        <div className="text-[11px] text-[#44474d] font-mono">{item.sub}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-xs font-semibold text-[#001229]">{item.date}</div>
                        <span className={`text-[10px] font-bold ${item.isToday ? 'text-[#ba1a1a]' : 'text-[#44474d]'}`}>
                          {item.dateBadge}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${item.categoryBadgeClass}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${item.isExpense ? 'text-[#ba1a1a]' : 'text-emerald-700'}`}>
                        {item.isExpense ? '- ' : '+ '}
                        R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${item.statusColor}`}>
                          {item.statusText}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => handlePayItem(item.id)}
                          className="p-1 hover:bg-[#dee8ff] rounded text-[#00687a] cursor-pointer"
                          title="Autorizar Liquidação / Visualizar"
                        >
                          <span className="material-symbols-outlined text-lg">paid</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-[#f0f3ff]/50 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs">
              <span className="text-[#44474d]">Totais previstos nesta semana</span>
              <div className="flex items-center gap-4">
                <span className="text-[#44474d]">
                  Saídas: <strong className="font-mono text-[#ba1a1a]">R$ 93.020,00</strong>
                </span>
                <span className="text-[#44474d]">
                  Entradas: <strong className="font-mono text-emerald-700">R$ 68.450,00</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card 1: Demonstrativo de Resultados Resumido (DRE Gerencial) */}
          <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#c4c6ce]/30">
              <div>
                <h2 className="text-[16px] font-bold text-[#001229] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00687a]">table_chart</span>
                  Demonstrativo de Resultados (DRE)
                </h2>
                <span className="text-xs text-[#44474d]">{dreData.periodLabel || 'Exercício Gerencial Consolidado (Mês Corrente)'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenImportModal}
                  className="px-2 py-1 rounded bg-[#00687a] hover:bg-[#004e5c] text-white text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="Alimentar este DRE via Planilha, PDF, CSV ou Markdown"
                >
                  <span className="material-symbols-outlined text-xs">publish</span>
                  Alimentar DRE
                </button>
                <span className="px-2 py-0.5 rounded bg-[#dee8ff] text-[#001229] text-[10px] font-bold">
                  OFICIAL
                </span>
              </div>
            </div>

            {/* DRE Structure */}
            <div className="mt-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-[#f0f3ff] font-bold">
                <span className="text-[#001229] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#001229]"></span>
                  (=) Faturamento Bruto de Tintas & Tintometria
                </span>
                <span className="font-mono text-[#001229]">
                  R$ {dreData.faturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d] border-b border-[#c4c6ce]/20">
                <span className="pl-3 flex items-center gap-1">
                  <span className="text-[#ba1a1a] font-bold">(-)</span> Deduções de Venda & Impostos
                </span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.deducoesImpostos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#001229] font-semibold">
                <span className="pl-2">(=) Receita Operacional Líquida</span>
                <span className="font-mono">
                  R$ {receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d] border-b border-[#c4c6ce]/20">
                <span className="pl-3 flex items-center gap-1">
                  <span className="text-[#ba1a1a] font-bold">(-)</span> CMV Tintas & Bases
                </span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.cmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-emerald-50/70 border border-emerald-100 font-bold">
                <span className="text-emerald-900 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-emerald-700">account_balance_wallet</span>
                  (=) Lucro Bruto Operacional (Margem {margemBruta.toFixed(1)}%)
                </span>
                <span className="font-mono text-emerald-800">
                  R$ {lucroBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d]">
                <span className="pl-3 flex items-center gap-1">
                  <span className="text-[#ba1a1a] font-bold">(-)</span> Pessoal & Balcão
                </span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.despesasPessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d]">
                <span className="pl-3 flex items-center gap-1">
                  <span className="text-[#ba1a1a] font-bold">(-)</span> Logística & Frota
                </span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.despesasLogistica.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d] border-b border-[#c4c6ce]/20">
                <span className="pl-3 flex items-center gap-1">
                  <span className="text-[#ba1a1a] font-bold">(-)</span> Financeiras & Cartões
                </span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.despesasFinanceiras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#001229] font-semibold">
                <span className="pl-2">(=) EBITDA (Lucro Operacional)</span>
                <span className="font-mono">
                  R$ {ebitda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1 text-[#44474d] border-b border-[#c4c6ce]/20">
                <span className="pl-3">(-) Depreciação Misturadores</span>
                <span className="font-mono text-[#ba1a1a]">
                  - R$ {dreData.depreciacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Final Net Profit */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#001229] text-white font-bold mt-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#57dffe]">verified</span>
                  <span className="text-xs">(=) LUCRO LÍQUIDO DO EXERCÍCIO</span>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-mono text-[#57dffe]">
                    R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-[#798fb1] font-normal">
                    Margem Líquida: {margemLiquida.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-[#c4c6ce]/30 flex items-center justify-between">
              <button
                onClick={() => alert('Planilha Balancete Contábil .XLSX gerada e baixada.')}
                className="text-[#00687a] text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">file_download</span>
                Exportar Balancete Contábil (.XLSX)
              </button>
              <span className="text-[11px] font-mono text-[#44474d]">
                Origem: {dreData.sourceFileName || 'Sistema ERP'}
              </span>
            </div>
          </div>


          {/* Card 2: Distribuição de Despesas por Centro de Custo */}
          <div className="bg-white border border-[#c4c6ce]/60 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#c4c6ce]/30">
              <div>
                <h2 className="text-[16px] font-bold text-[#001229] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00687a]">pie_chart</span>
                  Distribuição de Despesas por Centro de Custo
                </h2>
                <span className="text-xs text-[#44474d]">Composição proporcional dos desembolsos</span>
              </div>
              <span className="text-xs font-mono text-[#44474d]">Base: R$ 182.150,00</span>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#001229] flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00687a]"></span>
                    Reposição de Estoque Tintas (Suvinil/Coral/Lukscolor)
                  </span>
                  <span className="font-mono font-bold text-[#001229]">64% (R$ 116.576)</span>
                </div>
                <div className="w-full bg-[#f0f3ff] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00687a] h-full rounded-full" style={{ width: '64%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#001229] flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0f2744]"></span>
                    Folha de Pagamento & Comissões de Balcão
                  </span>
                  <span className="font-mono font-bold text-[#001229]">18% (R$ 32.787)</span>
                </div>
                <div className="w-full bg-[#f0f3ff] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#0f2744] h-full rounded-full" style={{ width: '18%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#001229] flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#57dffe]"></span>
                    Logística, Fretes & Entregas Expressas
                  </span>
                  <span className="font-mono font-bold text-[#001229]">10% (R$ 18.215)</span>
                </div>
                <div className="w-full bg-[#f0f3ff] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#57dffe] h-full rounded-full" style={{ width: '10%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#001229] flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#74777e]"></span>
                    Operacional Galpão, Energia & Impostos
                  </span>
                  <span className="font-mono font-bold text-[#001229]">8% (R$ 14.572)</span>
                </div>
                <div className="w-full bg-[#f0f3ff] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#74777e] h-full rounded-full" style={{ width: '8%' }}></div>
                </div>
              </div>
            </div>

            {/* Smart tip box */}
            <div className="mt-4 p-3 rounded-lg bg-[#f0f3ff] border border-[#c4c6ce]/40 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[#00687a] text-lg mt-0.5">tips_and_updates</span>
              <div>
                <div className="text-xs font-bold text-[#001229]">Otimização de Compras Identificada</div>
                <p className="text-[11px] text-[#44474d] leading-relaxed mt-0.5">
                  O volume de compras agrupadas de bases látex Suvinil garantiu 4,2% de desconto à vista no fechamento quinzenal. Mantenha o giro mínimo de 22 dias no estoque de esmaltes sintéticos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
