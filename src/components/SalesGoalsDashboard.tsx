import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  SalesGoalAnalytics,
  StoredSalesGoalConfig,
  GoalScenarioId,
  saveStoredSalesGoal,
} from '../utils/salesGoalService';

export interface SalesGoalsDashboardProps {
  goalConfig: StoredSalesGoalConfig;
  onUpdateGoalConfig: (next: StoredSalesGoalConfig) => void;
  goalAnalytics: SalesGoalAnalytics;
}

export const SalesGoalsDashboard: React.FC<SalesGoalsDashboardProps> = ({
  goalConfig,
  onUpdateGoalConfig,
  goalAnalytics,
}) => {
  const [manualInputStr, setManualInputStr] = useState<string>(() =>
    String(goalConfig.monthlyGoal)
  );
  const [goalFeedback, setGoalFeedback] = useState<string | null>(null);
  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);

  useEffect(() => {
    setManualInputStr(String(goalConfig.monthlyGoal));
  }, [goalConfig.monthlyGoal]);

  const showGoalFeedback = (msg: string) => {
    setGoalFeedback(msg);
    setTimeout(() => setGoalFeedback(null), 5000);
  };

  // Manager 1-click automatic goal assignment based on 6-month history
  const handleAcceptSuggestion = (
    scenarioId: Exclude<GoalScenarioId, 'manual'>,
    amount: number,
    label: string
  ) => {
    const nextConfig: StoredSalesGoalConfig = {
      monthlyGoal: amount,
      selectedScenario: scenarioId,
      updatedAt: new Date().toLocaleString('pt-BR'),
      autoSuggestedAccepted: true,
    };
    saveStoredSalesGoal(nextConfig);
    onUpdateGoalConfig(nextConfig);
    showGoalFeedback(
      `${label} (R$ ${amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}) definida automaticamente com 1 clique!`
    );
  };

  const handleSaveManualGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = Number(manualInputStr.replace(/[^\d.]/g, ''));
    if (!cleaned || cleaned < 10000) {
      showGoalFeedback('Informe uma meta mensal válida (mínimo R$ 10.000,00).');
      return;
    }
    const nextConfig: StoredSalesGoalConfig = {
      monthlyGoal: cleaned,
      selectedScenario: 'manual',
      updatedAt: new Date().toLocaleString('pt-BR'),
      autoSuggestedAccepted: false,
    };
    saveStoredSalesGoal(nextConfig);
    onUpdateGoalConfig(nextConfig);
    showGoalFeedback(
      `Meta manual atualizada para R$ ${cleaned.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}.`
    );
  };

  const handleAdjustGoalByDelta = (delta: number) => {
    const nextAmount = Math.max(50000, goalConfig.monthlyGoal + delta);
    const nextConfig: StoredSalesGoalConfig = {
      monthlyGoal: nextAmount,
      selectedScenario: 'manual',
      updatedAt: new Date().toLocaleString('pt-BR'),
      autoSuggestedAccepted: false,
    };
    saveStoredSalesGoal(nextConfig);
    onUpdateGoalConfig(nextConfig);
    showGoalFeedback(
      `Meta ajustada para R$ ${nextAmount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}.`
    );
  };

  // Gauge Chart Calculations
  const currentRev = goalAnalytics.currentMonthRevenue;
  const targetGoal = Math.max(1, goalConfig.monthlyGoal);
  const rawPct = (currentRev / targetGoal) * 100;
  const clampedPct = Math.min(100, Math.max(0, rawPct));
  const remainingAmount = Math.max(0, targetGoal - currentRev);
  const surplusAmount = Math.max(0, currentRev - targetGoal);
  const remainingDays = 5;
  const requiredDailyRunRate = remainingAmount / remainingDays;

  const gaugeColor =
    rawPct >= 100
      ? '#166534' // Emerald green
      : rawPct >= 85
      ? '#00687a' // Cyan primary
      : rawPct >= 60
      ? '#d97706' // Amber warning
      : '#ba1a1a'; // Crimson alert

  const gaugeStatusText =
    rawPct >= 100
      ? 'Meta Batida / Superávit'
      : rawPct >= 85
      ? 'Ritmo Forte (No Alvo)'
      : rawPct >= 60
      ? 'Atenção ao Ritmo Diário'
      : 'Abaixo do Esperado';

  // Recharts Semicircular Gauge Data (achieved vs remaining)
  const gaugePieData = useMemo(
    () => [
      { name: 'Realizado', value: clampedPct, color: gaugeColor },
      { name: 'Restante', value: Math.max(0, 100 - clampedPct), color: '#dee8ff' },
    ],
    [clampedPct, gaugeColor]
  );

  // Outer reference zone rings for the Gauge Chart (50% Alert, 30% Warning, 20% On-Target)
  const gaugeZonesData = useMemo(
    () => [
      { name: 'Zona Crítica (0-50%)', value: 50, color: '#fecaca' },
      { name: 'Zona Atenção (50-80%)', value: 30, color: '#fde68a' },
      { name: 'Zona Alvo (80-100%)', value: 20, color: '#a7f3d0' },
    ],
    []
  );

  // Needle angle: -90deg (0% left) to +90deg (100% right)
  const needleAngleDeg = -90 + (clampedPct / 100) * 180;

  // Sub-goals by department proportional to store mix
  const departmentSubGoals = useMemo(
    () => [
      {
        dept: 'Tintas Imobiliárias & Acrílicos',
        share: 0.57,
        current: currentRev * 0.571,
        target: targetGoal * 0.57,
      },
      {
        dept: 'Preparação, Massas & Seladores',
        share: 0.15,
        current: currentRev * 0.142,
        target: targetGoal * 0.15,
      },
      {
        dept: 'Solventes, Vernizes & Automotiva',
        share: 0.18,
        current: currentRev * 0.186,
        target: targetGoal * 0.18,
      },
      {
        dept: 'Acessórios & Ferramentas Pro',
        share: 0.1,
        current: currentRev * 0.101,
        target: targetGoal * 0.1,
      },
    ],
    [currentRev, targetGoal]
  );

  return (
    <section className="bg-white rounded-xl border border-[#c4c6ce]/50 p-5 shadow-xs">
      {/* Header: Title & 1-Click Automatic Manager Goal Action */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[#c4c6ce]/30">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-[#00687a] text-xl">speed</span>
            <h3 className="text-[16px] font-bold text-[#001229]">
              Painel de Metas de Vendas Mensais & Sugestão Inteligente (6 Meses)
            </h3>
            <span className="text-xs text-[#44474d]">
              · SalesGoalsDashboard · Histórico Abr–Set/2026
            </span>
          </div>
          <p className="text-xs text-[#44474d] mt-0.5">
            Acompanhe o atingimento no medidor de progresso (Gauge Chart) ou defina a meta automaticamente com um clique a partir dos últimos 6 meses.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowFormulaDetails((prev) => !prev)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#c4c6ce] bg-white hover:bg-[#f0f3ff] text-[#001229] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-sm text-[#00687a]">
              functions
            </span>
            <span>{showFormulaDetails ? 'Ocultar Cálculo 6M' : 'Ver Memória de Cálculo 6M'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleAcceptSuggestion(
                goalAnalytics.recommendedSuggestion.id,
                goalAnalytics.recommendedSuggestion.suggestedAmount,
                goalAnalytics.recommendedSuggestion.label
              )
            }
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#00687a] hover:bg-[#004e5c] text-white text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap"
            title="Definir automaticamente a meta recomendada com base nos últimos 6 meses de vendas"
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            <span>
              Definir Meta Automaticamente (R${' '}
              {goalAnalytics.recommendedSuggestion.suggestedAmount.toLocaleString('pt-BR')})
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Banner */}
      {goalFeedback && (
        <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-emerald-700">
              check_circle
            </span>
            <span>{goalFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setGoalFeedback(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Optional Expandable 6-Month Formula & Calculation Breakdown */}
      {showFormulaDetails && (
        <div className="mt-3 p-3.5 rounded-xl bg-[#f0f3ff]/80 border border-[#c4c6ce]/60 text-xs text-[#001229] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#00687a]">
                calculate
              </span>
              Memória de Cálculo — Serviço de Metas (Últimos 6 Meses)
            </span>
            <span className="font-mono text-[11px] text-[#44474d]">
              Atualizado em: {goalConfig.updatedAt}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-2.5 rounded-lg border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">1. Média Móvel Ponderada (6M)</div>
              <div className="font-mono font-bold text-sm mt-0.5 tabular-nums">
                R$ {goalAnalytics.weightedAverage6Months.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-[#44474d] mt-0.5">
                Pesos crescentes (1.0x em Abr até 4.0x em Set) priorizando o trimestre recente.
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">2. Taxa de Crescimento Mensal (CMGR)</div>
              <div className="font-mono font-bold text-sm text-emerald-700 mt-0.5 tabular-nums">
                +{goalAnalytics.cmgrPct}% ao mês
              </div>
              <div className="text-[11px] text-[#44474d] mt-0.5">
                Evolução de R$ {(goalAnalytics.history6Months[0].revenue / 1000).toFixed(1)}k (Abr) para R$ {(goalAnalytics.currentMonthRevenue / 1000).toFixed(1)}k (Set).
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-[#c4c6ce]/40">
              <div className="text-[11px] text-[#74777e]">3. Projeção Recomendada (+9,5%)</div>
              <div className="font-mono font-bold text-sm text-[#00687a] mt-0.5 tabular-nums">
                R$ {goalAnalytics.recommendedSuggestion.suggestedAmount.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-[#44474d] mt-0.5">
                Média ponderada ajustada pela curva de alta estação de pintura e reformas.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-stretch">
        {/* LEFT 5 COLS: RECHARTS GAUGE CHART & MANUAL GOAL CONTROL */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-[#f8f9ff] rounded-xl border border-[#c4c6ce]/40 p-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-[#001229]">
                Medidor de Progresso Mensal (Gauge Chart)
              </span>
              <span className="text-xs font-bold" style={{ color: gaugeColor }}>
                {gaugeStatusText}
              </span>
            </div>

            {/* Recharts Semicircular Gauge + Calibrated Pointer */}
            <div className="relative flex flex-col items-center justify-center pt-1">
              <div className="w-full h-44 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Outer Subtle Zone Ring */}
                    <Pie
                      data={gaugeZonesData}
                      dataKey="value"
                      cx="50%"
                      cy="82%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={96}
                      outerRadius={104}
                      paddingAngle={1}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {gaugeZonesData.map((entry, idx) => (
                        <Cell key={`zone-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>

                    {/* Primary Progress Gauge Arc */}
                    <Pie
                      data={gaugePieData}
                      dataKey="value"
                      cx="50%"
                      cy="82%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={68}
                      outerRadius={92}
                      paddingAngle={0}
                      cornerRadius={6}
                      stroke="none"
                    >
                      {gaugePieData.map((entry, idx) => (
                        <Cell key={`gauge-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Overlay SVG Needle & Scale Labels aligned with cx=50%, cy=82% */}
                <svg
                  viewBox="0 0 280 155"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <text x="26" y="136" fontSize="10" fill="#74777e" fontFamily="monospace">
                    0%
                  </text>
                  <text x="131" y="16" fontSize="10" fill="#44474d" fontWeight="bold" fontFamily="monospace">
                    50%
                  </text>
                  <text x="234" y="136" fontSize="10" fill="#166534" fontWeight="bold" fontFamily="monospace">
                    100%
                  </text>

                  <g
                    transform={`translate(140, 127) rotate(${needleAngleDeg})`}
                    style={{ transition: 'transform 0.5s ease-out' }}
                  >
                    <polygon points="-3.5,0 0,-76 3.5,0" fill="#001229" />
                    <circle cx="0" cy="0" r="7" fill="#001229" />
                    <circle cx="0" cy="0" r="3" fill="#57dffe" />
                  </g>
                </svg>
              </div>

              {/* Central Tabular Readout */}
              <div className="text-center -mt-3">
                <div
                  className="text-3xl font-extrabold font-mono tabular-nums tracking-tight"
                  style={{ color: gaugeColor }}
                >
                  {rawPct.toFixed(1)}%
                </div>
                <div className="text-xs text-[#44474d] mt-0.5 font-mono tabular-nums">
                  Realizado:{' '}
                  <strong className="text-[#001229]">
                    R$ {currentRev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>{' '}
                  / Meta:{' '}
                  <strong className="text-[#00687a]">
                    R$ {targetGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Gap vs Target & Daily Run-Rate */}
            <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-[#c4c6ce]/40 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-[#c4c6ce]/40">
                <div className="text-[11px] text-[#74777e]">
                  {remainingAmount > 0 ? 'Falta para a Meta' : 'Superávit Acima da Meta'}
                </div>
                <div className="font-mono font-bold text-sm text-[#001229] tabular-nums mt-0.5">
                  R${' '}
                  {(remainingAmount > 0 ? remainingAmount : surplusAmount).toLocaleString(
                    'pt-BR',
                    { minimumFractionDigits: 2 }
                  )}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-[#c4c6ce]/40">
                <div className="text-[11px] text-[#74777e]">
                  Ritmo Diário Necessário ({remainingDays}d)
                </div>
                <div className="font-mono font-bold text-sm text-[#00687a] tabular-nums mt-0.5">
                  {remainingAmount > 0
                    ? `R$ ${requiredDailyRunRate.toLocaleString('pt-BR', {
                        maximumFractionDigits: 0,
                      })}/dia`
                    : 'Meta Concluída!'}
                </div>
              </div>
            </div>

            {/* Sub-goals by Product Line */}
            <div className="mt-3 pt-3 border-t border-[#c4c6ce]/40 space-y-2">
              <div className="text-[11px] font-bold text-[#001229]">
                Desdobramento Proporcional por Linha:
              </div>
              {departmentSubGoals.map((item) => {
                const pct = Math.min(100, Math.round((item.current / Math.max(1, item.target)) * 100));
                return (
                  <div key={item.dept} className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#44474d] truncate">{item.dept}</span>
                      <span className="font-mono tabular-nums text-[#001229] font-semibold">
                        R$ {(item.current / 1000).toFixed(1)}k / {(item.target / 1000).toFixed(1)}k ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#dee8ff] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00687a] rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual Goal Adjustment Form */}
          <form
            onSubmit={handleSaveManualGoal}
            className="mt-4 pt-3 border-t border-[#c4c6ce]/40 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-[#001229]">
                Ajuste Manual do Gerente (R$):
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAdjustGoalByDelta(-10000)}
                  className="px-2 py-0.5 rounded bg-white border border-[#c4c6ce]/60 text-[11px] font-mono font-semibold text-[#44474d] hover:text-[#001229] cursor-pointer"
                >
                  -10k
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustGoalByDelta(10000)}
                  className="px-2 py-0.5 rounded bg-white border border-[#c4c6ce]/60 text-[11px] font-mono font-semibold text-[#44474d] hover:text-[#001229] cursor-pointer"
                >
                  +10k
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustGoalByDelta(25000)}
                  className="px-2 py-0.5 rounded bg-white border border-[#c4c6ce]/60 text-[11px] font-mono font-semibold text-[#44474d] hover:text-[#001229] cursor-pointer"
                >
                  +25k
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#74777e]">
                  R$
                </span>
                <input
                  type="number"
                  step="500"
                  min="10000"
                  value={manualInputStr}
                  onChange={(e) => setManualInputStr(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs font-mono font-bold bg-white border border-[#c4c6ce] rounded-lg text-[#001229] focus:outline-none focus:border-[#00687a]"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#001229] hover:bg-[#0f2744] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                Salvar Meta
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT 7 COLS: 6-MONTH HISTORICAL ANALYSIS & 1-CLICK SUGGESTION CARDS */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          {/* 6-Month Telemetry Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-[#f0f3ff]/70 border border-[#dee8ff]">
            <div>
              <div className="text-[11px] text-[#74777e]">Média Simples (6M)</div>
              <div className="text-sm font-mono font-bold text-[#001229] tabular-nums">
                R$ {goalAnalytics.average6Months.toLocaleString('pt-BR')}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#74777e]">Média Ponderada (6M)</div>
              <div className="text-sm font-mono font-bold text-[#00687a] tabular-nums">
                R$ {goalAnalytics.weightedAverage6Months.toLocaleString('pt-BR')}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#74777e]">Tendência Semestral</div>
              <div className="text-sm font-mono font-bold text-emerald-700 tabular-nums">
                +{goalAnalytics.cmgrPct}% / mês
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#74777e]">Pico do Semestre</div>
              <div className="text-sm font-mono font-bold text-[#001229] tabular-nums">
                {goalAnalytics.peakMonth.monthShort} (R${' '}
                {(goalAnalytics.peakMonth.revenue / 1000).toFixed(1)}k)
              </div>
            </div>
          </div>

          {/* 6-Month History BarChart */}
          <div className="bg-white rounded-lg border border-[#c4c6ce]/40 p-3">
            <div className="flex items-center justify-between text-xs mb-2 flex-wrap gap-1">
              <span className="font-bold text-[#001229]">
                Histórico de Faturamento — Últimos 6 Meses (Abr/26 a Set/26)
              </span>
              <span className="text-[11px] text-[#74777e] font-mono">
                Linha tracejada = Média 6M (R${' '}
                {(goalAnalytics.average6Months / 1000).toFixed(1)}k)
              </span>
            </div>
            <div className="w-full h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={goalAnalytics.history6Months}
                  margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                  <XAxis
                    dataKey="monthShort"
                    fontSize={11}
                    stroke="#74777e"
                    tickLine={false}
                    axisLine={{ stroke: '#c4c6ce' }}
                  />
                  <YAxis
                    fontSize={10}
                    stroke="#74777e"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [
                      `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                      'Faturamento Realizado',
                    ]}
                    labelFormatter={(lbl) => `Período: ${lbl}`}
                  />
                  <ReferenceLine
                    y={goalAnalytics.average6Months}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                  />
                  <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
                    {goalAnalytics.history6Months.map((entry, index) => (
                      <Cell
                        key={entry.monthKey}
                        fill={
                          index === goalAnalytics.history6Months.length - 1
                            ? '#00687a'
                            : '#0f2744'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 6-Month Compact Monthly Breakdown Strip */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-2 mt-2 border-t border-[#c4c6ce]/30">
              {goalAnalytics.history6Months.map((m) => (
                <div
                  key={m.monthKey}
                  className="p-1.5 rounded bg-[#f8f9ff] border border-[#c4c6ce]/30 text-center"
                >
                  <div className="text-[10px] font-semibold text-[#44474d]">{m.monthShort}</div>
                  <div className="text-[11px] font-mono font-bold text-[#001229] tabular-nums">
                    R$ {(m.revenue / 1000).toFixed(1)}k
                  </div>
                  <div
                    className={`text-[10px] font-mono tabular-nums ${
                      m.growthPct >= 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {m.growthPct >= 0 ? `+${m.growthPct}%` : `${m.growthPct}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Auto-Suggested Goal Scenarios with 1-Click Manager Acceptance */}
          <div>
            <div className="text-xs font-bold text-[#001229] mb-2">
              Sugestões Calculadas pelo Serviço de Metas (Defina com 1 Clique):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {goalAnalytics.suggestions.map((sug) => {
                const isSelected =
                  goalConfig.monthlyGoal === sug.suggestedAmount &&
                  goalConfig.selectedScenario === sug.id;

                return (
                  <div
                    key={sug.id}
                    className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'bg-[#e7eeff]/70 border-[#00687a]'
                        : sug.recommended
                        ? 'bg-[#f8f9ff] border-[#00687a]/60'
                        : 'bg-white border-[#c4c6ce]/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#44474d]">
                        <span className="font-semibold">{sug.tag}</span>
                        {isSelected && (
                          <span className="font-bold text-[#00687a]">Ativa</span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-[#001229] mt-0.5">
                        {sug.label}
                      </div>
                      <div className="text-base font-extrabold font-mono text-[#001229] tabular-nums mt-1">
                        R$ {sug.suggestedAmount.toLocaleString('pt-BR')}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-mono mt-0.5 tabular-nums">
                        +{sug.growthVsAveragePct}% vs média 6M · R${' '}
                        {sug.dailyRequired.toLocaleString('pt-BR')}/dia
                      </div>
                      <p className="text-[11px] text-[#74777e] mt-1.5 leading-snug">
                        {sug.rationale}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleAcceptSuggestion(
                          sug.id,
                          sug.suggestedAmount,
                          sug.label
                        )
                      }
                      className={`mt-3 w-full py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-[#166534] text-white'
                          : sug.recommended
                          ? 'bg-[#00687a] hover:bg-[#004e5c] text-white'
                          : 'bg-[#001229] hover:bg-[#0f2744] text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isSelected ? 'check_circle' : 'bolt'}
                      </span>
                      <span>
                        {isSelected ? 'Meta Aplicada' : 'Aceitar com 1 Clique'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
