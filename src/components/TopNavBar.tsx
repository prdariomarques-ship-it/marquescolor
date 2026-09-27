import React, { useState, useEffect } from 'react';
import { ActiveScreen, RoleId } from '../types';

interface TopNavBarProps {
  activeScreen: ActiveScreen;
  currentUser: {
    name: string;
    roleId: RoleId;
    matricula: string;
  };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenHelp: () => void;
  onOpenCloseCashier: () => void;
  onOpenTintometria: () => void;
  onNavigate: (s: ActiveScreen) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  activeScreen,
  currentUser,
  searchQuery,
  onSearchChange,
  onOpenHelp,
  onOpenCloseCashier,
  onOpenTintometria,
  onNavigate,
}) => {
  const [timeStr, setTimeStr] = useState('14:32:08');
  const [isSyncing, setIsSyncing] = useState(false);
  const [notificationCount, setNotificationCount] = useState(3);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-BR'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      alert('Sincronização com o servidor em nuvem e a máquina tintométrica concluída com sucesso!');
    }, 900);
  };

  const getScreenTitle = () => {
    switch (activeScreen) {
      case 'dashboard':
        return {
          title: 'Painel Gerencial & Desempenho',
          sub: 'Visão em tempo real de faturamento, estoque de bases e tintometria',
          tag: 'Loja Matriz #01'
        };
      case 'pdv':
        return {
          title: 'MarquesColor POS Pro - Frente de Caixa',
          sub: 'Venda ágil de balcão com leitor ótico e cálculo de troco',
          tag: 'V4.8'
        };
      case 'clientes':
        return {
          title: 'Base de Clientes & Faturamento a Prazo',
          sub: 'Gestão de limites de crédito, convênios de pintores e duplicatas',
          tag: 'Convênio Corporativo'
        };
      case 'relatorios':
        return {
          title: 'Módulo Financeiro & Fluxo de Caixa',
          sub: 'DRE consolidado, demonstrativo contábil e conciliação de fornecedores',
          tag: 'Exercício 2023'
        };
      case 'auth':
        return {
          title: 'Segurança & Controle de Acesso RBAC',
          sub: 'Autenticação de operador com perfil de permissões e restrições',
          tag: 'Enterprise EAL4+'
        };
      default:
        return {
          title: 'MarquesColor POS Pro',
          sub: 'Tintas & Revestimentos Especializados',
          tag: 'Online'
        };
    }
  };

  const info = getScreenTitle();

  return (
    <header className="fixed top-0 right-0 left-64 h-16 flex items-center z-20 bg-white border-b border-[#c4c6ce]/40 shadow-xs select-none">
      <div className="flex justify-between items-center w-full px-6 h-full gap-4">
        {/* Left: Screen Identity & Quick Global Search */}
        <div className="flex items-center gap-6">
          <div className="min-w-[280px]">
            <div className="text-[16px] font-bold text-[#001229] flex items-center gap-2 leading-tight">
              <span>{info.title}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#acedff]/50 text-[#004e5c] whitespace-nowrap">
                {info.tag}
              </span>
            </div>
            <div className="text-[12px] text-[#44474d] truncate">
              {info.sub}
            </div>
          </div>

          {/* Global Fast Search with Barcode / SKU auto-detect */}
          <div className="relative w-72 lg:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar SKU, Cliente, Fórmula ou F2..."
              className="w-full pl-9 pr-14 py-1.5 text-xs bg-[#f0f3ff]/70 hover:bg-[#f0f3ff] border border-[#c4c6ce]/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00687a]/40 focus:border-[#00687a] transition-all"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1 pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#44474d] bg-white rounded border border-[#c4c6ce]/60 shadow-xs">
                F2
              </kbd>
            </div>
          </div>
        </div>

        {/* Right: Operational Shortcuts, Shift Status, Telemetry & Actions */}
        <div className="flex items-center gap-3">
          {/* F-Keys POS Quick Bar */}
          <div className="hidden xl:flex items-center gap-1.5 bg-[#f0f3ff]/60 px-2 py-1 rounded-lg border border-[#c4c6ce]/30">
            <button
              onClick={onOpenHelp}
              className="px-2 py-1 text-xs font-semibold text-[#44474d] hover:text-[#001229] rounded hover:bg-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span className="font-mono text-[#001229] font-bold">F1</span>
              <span>Ajuda</span>
            </button>
            <span className="text-[#c4c6ce]">|</span>
            <button
              onClick={onOpenCloseCashier}
              className="px-2 py-1 text-xs font-semibold text-[#44474d] hover:text-[#001229] rounded hover:bg-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span className="font-mono text-[#ba1a1a] font-bold">F10</span>
              <span>Fechar Caixa</span>
            </button>
          </div>

          {/* Cash Register Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-emerald-900 whitespace-nowrap">
              Caixa Aberto • Turno 1
            </span>
          </div>

          {/* Clock & Date */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-[#44474d] bg-[#f0f3ff]/50 rounded-lg border border-[#c4c6ce]/30">
            <span className="material-symbols-outlined text-sm text-[#74777e]">schedule</span>
            <span>{timeStr} • 24/10/2023</span>
          </div>

          {/* Icon Actions Cluster */}
          <div className="flex items-center gap-1 border-l border-[#c4c6ce]/40 pl-3">
            <button
              onClick={handleSync}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-[#44474d] hover:text-[#001229] hover:bg-[#f0f3ff] transition-all cursor-pointer ${isSyncing ? 'animate-spin text-[#00687a]' : ''}`}
              title="Sincronizar Dados"
            >
              <span className="material-symbols-outlined text-xl">sync</span>
            </button>

            <button
              onClick={() => window.print()}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#44474d] hover:text-[#001229] hover:bg-[#f0f3ff] transition-colors cursor-pointer"
              title="Imprimir Relatório de Turno"
            >
              <span className="material-symbols-outlined text-xl">print</span>
            </button>

            <button
              onClick={() => {
                alert(`Notificações do Sistema:\n1. 8 itens atingiram estoque mínimo de base.\n2. Título de Suvinil vence hoje (R$ 42.800,00).\n3. Tintométrica calibrada com sucesso.`);
                setNotificationCount(0);
              }}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#44474d] hover:text-[#001229] hover:bg-[#f0f3ff] transition-colors cursor-pointer"
              title="Notificações"
            >
              <span className="material-symbols-outlined text-xl">notifications</span>
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ba1a1a] rounded-full ring-2 ring-white"></span>
              )}
            </button>

            <button
              onClick={onOpenTintometria}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#00687a] hover:bg-[#f0f3ff] transition-colors cursor-pointer"
              title="Abrir Dosador Tintométrico"
            >
              <span className="material-symbols-outlined text-xl">colorize</span>
            </button>
          </div>

          {/* Cashier Avatar Pill */}
          <div 
            onClick={() => onNavigate('auth')} 
            className="flex items-center gap-2 pl-2 cursor-pointer group"
            title="Alterar operador / Ver perfil"
          >
            <div className="w-9 h-9 rounded-full bg-[#0f2744] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#57dffe]/40 group-hover:ring-[#57dffe] transition-all">
              {currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <div className="text-xs font-bold text-[#001229]">{currentUser.name}</div>
              <div className="text-[10px] text-[#74777e]">Operador Líder</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
