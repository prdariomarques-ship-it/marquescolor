import React from 'react';
import { ActiveScreen, RoleId } from '../types';
import { useTheme } from '../context/ThemeContext';

interface SideNavBarProps {
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  onOpenNewOrder: () => void;
  currentUser: {
    name: string;
    roleId: RoleId;
    matricula: string;
  };
  tintometricConnected: boolean;
  onOpenTintometria: () => void;
  criticalCount?: number;
  salesCount?: number;
}

export const SideNavBar: React.FC<SideNavBarProps> = ({
  activeScreen,
  onNavigate,
  onOpenNewOrder,
  currentUser,
  tintometricConnected,
  onOpenTintometria,
  criticalCount,
  salesCount,
}) => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 flex flex-col z-30 bg-[#0f2744] text-white border-r border-[#c4c6ce]/30 shadow-md select-none">
      <div className="h-full flex flex-col justify-between p-4 overflow-y-auto">
        {/* Brand & Header */}
        <div>
          <div 
            onClick={() => onNavigate('dashboard')} 
            className="flex items-center gap-3 px-2 py-2 mb-4 cursor-pointer group"
          >
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00687a] to-[#57dffe] flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[#001229] text-2xl font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>
                palette
              </span>
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#acedff] rounded-full border-2 border-[#0f2744]"></div>
            </div>
            <div>
              <div className="text-[20px] font-bold tracking-tight text-white flex items-center gap-1.5 leading-tight">
                MarquesColor
                <span className="w-1.5 h-1.5 rounded-full bg-[#57dffe] inline-block animate-pulse"></span>
              </div>
              <div className="text-[11px] font-semibold text-[#798fb1] tracking-wider uppercase">
                Tintas & Revestimentos
              </div>
            </div>
          </div>

          {/* Quick CTA: Novo Pedido [F3] */}
          <button 
            onClick={onOpenNewOrder}
            className="w-full mb-5 flex items-center justify-between px-3.5 py-2.5 bg-[#57dffe]/20 hover:bg-[#57dffe]/30 border border-[#57dffe]/40 rounded-lg text-[#acedff] font-semibold text-[13px] transition-all active:scale-[0.99] group shadow-sm cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#57dffe] text-xl">add_circle</span>
              <span>Novo Pedido</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[#0f2744]/90 border border-[#57dffe]/30 text-[11px] font-mono text-[#acedff] font-bold">
              F3
            </span>
          </button>

          {/* Navigation Tabs */}
          <nav className="space-y-1">
            {/* 1. Dashboard */}
            <button
              onClick={() => onNavigate('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'dashboard'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span 
                className={`material-symbols-outlined text-xl ${activeScreen === 'dashboard' ? 'text-[#57dffe]' : ''}`} 
                style={{ fontVariationSettings: activeScreen === 'dashboard' ? "'FILL' 1" : "'FILL' 0" }}
              >
                dashboard
              </span>
              <span className="text-[13px]">Dashboard</span>
            </button>

            {/* 2. PDV / Caixa */}
            <button
              onClick={() => onNavigate('pdv')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'pdv'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span className="flex items-center gap-3">
                <span 
                  className={`material-symbols-outlined text-xl ${activeScreen === 'pdv' ? 'text-[#57dffe]' : ''}`}
                  style={{ fontVariationSettings: activeScreen === 'pdv' ? "'FILL' 1" : "'FILL' 0" }}
                >
                  point_of_sale
                </span>
                <span className="text-[13px]">PDV / Caixa</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-[#57dffe] animate-pulse"></span>
            </button>

            {/* 3. Produtos & Fórmulas (Tintometria) */}
            <button
              onClick={onOpenTintometria}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-[#798fb1] hover:text-white hover:bg-white/5 font-medium group`}
            >
              <span className="material-symbols-outlined text-xl group-hover:text-[#57dffe] transition-colors">
                palette
              </span>
              <div className="flex-1 flex items-center justify-between">
                <span className="text-[13px]">Fórmulas & Tintometria</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#00687a]/60 text-[#57dffe]">PRO</span>
              </div>
            </button>

            {/* 4. Estoque */}
            <button
              onClick={() => onNavigate('estoque')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'estoque'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-xl ${activeScreen === 'estoque' ? 'text-[#57dffe]' : ''}`}
                  style={{ fontVariationSettings: activeScreen === 'estoque' ? "'FILL' 1" : "'FILL' 0" }}
                >
                  inventory_2
                </span>
                <span className="text-[13px]">Gestão de Estoque</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#ba1a1a] text-white">
                {criticalCount ?? 8}
              </span>
            </button>

            {/* 5. Clientes */}
            <button
              onClick={() => onNavigate('clientes')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'clientes'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span 
                className={`material-symbols-outlined text-xl ${activeScreen === 'clientes' ? 'text-[#57dffe]' : ''}`}
                style={{ fontVariationSettings: activeScreen === 'clientes' ? "'FILL' 1" : "'FILL' 0" }}
              >
                group
              </span>
              <span className="text-[13px]">Clientes & Crédito</span>
            </button>

            {/* 6. Fornecedores */}
            <button
              onClick={() => onNavigate('relatorios')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[#798fb1] hover:text-white hover:bg-white/5 font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-xl">local_shipping</span>
              <span className="text-[13px]">Fornecedores Tintas</span>
            </button>

            {/* 7. Orçamentos */}
            <button
              onClick={() => onNavigate('pdv')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[#798fb1] hover:text-white hover:bg-white/5 font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-xl">request_quote</span>
              <span className="text-[13px]">Orçamentos</span>
            </button>

            {/* 8. Vendas */}
            <button
              onClick={() => onNavigate('vendas')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'vendas'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-xl ${activeScreen === 'vendas' ? 'text-[#57dffe]' : ''}`}
                  style={{ fontVariationSettings: activeScreen === 'vendas' ? "'FILL' 1" : "'FILL' 0" }}
                >
                  receipt_long
                </span>
                <span className="text-[13px]">Histórico Vendas</span>
              </span>
              {salesCount !== undefined && salesCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#00687a] text-white">
                  {salesCount}
                </span>
              )}
            </button>

            {/* 9. Relatórios / Financeiro */}
            <button
              onClick={() => onNavigate('relatorios')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'relatorios'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span className="flex items-center gap-3">
                <span 
                  className={`material-symbols-outlined text-xl ${activeScreen === 'relatorios' ? 'text-[#57dffe]' : ''}`}
                  style={{ fontVariationSettings: activeScreen === 'relatorios' ? "'FILL' 1" : "'FILL' 0" }}
                >
                  bar_chart
                </span>
                <span className="text-[13px]">Financeiro & DRE</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#57dffe]/20 text-[#57dffe] text-[10px] font-bold font-mono">DRE</span>
            </button>

            {/* 10. Acesso / RBAC Auth */}
            <button
              onClick={() => onNavigate('auth')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeScreen === 'auth'
                  ? 'bg-white/10 text-white font-bold border-l-4 border-[#57dffe] shadow-xs'
                  : 'text-[#798fb1] hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <span className="material-symbols-outlined text-xl">manage_accounts</span>
              <span className="text-[13px]">Controle RBAC / Login</span>
            </button>
          </nav>
        </div>

        {/* Footer Hardware & Operator Telemetry */}
        <div className="pt-4 border-t border-[#c4c6ce]/20 space-y-2.5">
          {/* Ambiente Claro / Escuro Switcher in SideNav */}
          <div className="flex items-center justify-between p-1.5 bg-black/20 rounded-lg border border-white/10 text-xs">
            <span className="text-[11px] font-semibold text-[#798fb1] pl-1.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">
                {isDark ? 'dark_mode' : 'light_mode'}
              </span>
              Ambiente
            </span>
            <div className="inline-flex p-0.5 rounded-md bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => !isDark || toggleTheme()}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  !isDark
                    ? 'bg-amber-400 text-[#001229] shadow-xs'
                    : 'text-[#798fb1] hover:text-white'
                }`}
                title="Ativar Ambiente Claro"
              >
                <span className="material-symbols-outlined text-xs">light_mode</span>
                <span>Claro</span>
              </button>
              <button
                type="button"
                onClick={() => isDark || toggleTheme()}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#57dffe] text-[#001229] shadow-xs'
                    : 'text-[#798fb1] hover:text-white'
                }`}
                title="Ativar Ambiente Escuro"
              >
                <span className="material-symbols-outlined text-xs">dark_mode</span>
                <span>Escuro</span>
              </button>
            </div>
          </div>

          {/* Hardware status badge */}
          <button 
            onClick={onOpenTintometria}
            className="w-full text-left px-2.5 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[#57dffe] text-lg">tune</span>
              <span className="text-[11px] font-semibold text-white tracking-tight truncate">
                {tintometricConnected ? 'Tintométrica Conectada' : 'Aferição Tintométrica'}
              </span>
            </div>
            <span className={`w-2 h-2 rounded-full ${tintometricConnected ? 'bg-[#57dffe] animate-pulse shadow-[0_0_8px_#57dffe]' : 'bg-amber-400'}`}></span>
          </button>

          {/* Operator User profile chip */}
          <div 
            onClick={() => onNavigate('auth')}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group" 
            title="Clique para alternar perfil / autenticar"
          >
            <div className="w-8 h-8 rounded-full bg-[#00687a] text-white flex items-center justify-center font-bold text-xs shadow-sm ring-1 ring-white/20">
              {currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate group-hover:text-[#57dffe] transition-colors">
                {currentUser.name}
              </div>
              <div className="text-[10px] font-mono text-[#798fb1]">
                {currentUser.matricula} • Caixa 01
              </div>
            </div>
            <span className="material-symbols-outlined text-[#798fb1] text-lg group-hover:text-white transition-colors">
              switch_account
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
