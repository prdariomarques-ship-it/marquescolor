import React, { useRef, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { ActiveScreen } from '../types';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ActiveScreen) => void;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const {
    allAlerts,
    dismissAlert,
    clearAllAlerts,
    markAllAsRead,
    testStockAlert,
    soundEnabled,
    setSoundEnabled,
  } = useNotification();

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    markAllAsRead();

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, markAllAsRead]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-12 right-0 w-80 sm:w-96 bg-white dark:bg-[#1a273b] border border-[#c4c6ce]/80 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left select-none"
    >
      {/* Popover Header */}
      <div className="bg-[#001229] text-white p-3.5 flex items-center justify-between border-b border-[#57dffe]/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
            <span className="material-symbols-outlined text-lg">notifications_active</span>
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Alertas de Estoque Crítico</span>
              {allAlerts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#ba1a1a] text-white">
                  {allAlerts.length}
                </span>
              )}
            </h4>
            <p className="text-[10px] text-[#a6c8ff]">
              Monitoramento contínuo de ruptura de estoque
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-colors cursor-pointer ${
              soundEnabled ? 'text-[#57dffe] hover:bg-white/10' : 'text-slate-400 hover:bg-white/10'
            }`}
            title={soundEnabled ? 'Alerta Sonoro Ativo (Clique para silenciar)' : 'Alerta Sonoro Desativado (Clique para ativar)'}
          >
            <span className="material-symbols-outlined text-base">
              {soundEnabled ? 'volume_up' : 'volume_off'}
            </span>
          </button>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>

      {/* Simulator / Test Trigger Button Bar */}
      <div className="p-2.5 bg-[#f0f3ff] dark:bg-slate-800/60 border-b border-[#c4c6ce]/30 flex items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-[#44474d] dark:text-slate-300 font-medium">
          Deseja testar os avisos visuais?
        </span>
        <button
          type="button"
          onClick={() => testStockAlert()}
          className="px-2.5 py-1 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95"
          title="Dispara um toast visual de alerta de estoque crítico"
        >
          <span className="material-symbols-outlined text-xs">notification_add</span>
          <span>Simular Toast</span>
        </button>
      </div>

      {/* Alert Items List */}
      <div className="max-h-72 overflow-y-auto divide-y divide-[#c4c6ce]/20 dark:divide-slate-800">
        {allAlerts.length === 0 ? (
          <div className="p-6 text-center text-[#74777e] dark:text-slate-400 space-y-2">
            <span className="material-symbols-outlined text-3xl text-emerald-500">
              check_circle
            </span>
            <div className="text-xs font-bold text-[#001229] dark:text-white">
              Nenhum alerta pendente no momento
            </div>
            <p className="text-[11px]">
              Todos os produtos estão com níveis de estoque acima do limite crítico de segurança.
            </p>
            <button
              onClick={() => testStockAlert()}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#00687a] text-white text-[11px] font-bold hover:bg-[#004e5c] transition-colors cursor-pointer"
            >
              <span>Disparar Alerta de Demonstração</span>
            </button>
          </div>
        ) : (
          allAlerts.map(alert => (
            <div
              key={alert.id}
              className="p-3 hover:bg-[#f0f3ff]/50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-2.5"
            >
              {/* Swatch indicator */}
              <div
                className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center shrink-0 border border-black/10 relative mt-0.5"
                style={{ backgroundColor: alert.swatchHex || '#e2e8f0' }}
              >
                {alert.swatchDot && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: alert.swatchDot }}
                  />
                )}
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full"></span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-[#001229] dark:text-white truncate">
                    {alert.productName}
                  </span>
                  <span className="text-[10px] text-[#74777e] dark:text-slate-400 font-mono shrink-0">
                    {alert.timestamp}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-[#74777e] dark:text-slate-300 mt-0.5">
                  <span className="font-mono">{alert.sku}</span>
                  <span>•</span>
                  <span>{alert.brand}</span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-red-700 dark:text-red-400 font-bold font-mono">
                    Restante: {alert.currentStock} {alert.stockUnit} (Mín: {alert.minStock})
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate('estoque');
                      }}
                      className="px-2 py-0.5 rounded bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      Repor
                    </button>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="px-1.5 py-0.5 rounded text-[#74777e] hover:text-[#001229] dark:hover:text-white text-[10px] transition-colors cursor-pointer"
                      title="Dispensar alerta"
                    >
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Popover Footer */}
      {allAlerts.length > 0 && (
        <div className="p-2.5 bg-[#f0f3ff] dark:bg-slate-800/80 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs">
          <button
            onClick={clearAllAlerts}
            className="text-[11px] text-[#74777e] hover:text-red-600 dark:hover:text-red-400 font-semibold cursor-pointer"
          >
            Limpar Todos os Alertas
          </button>
          <button
            onClick={() => {
              onClose();
              onNavigate('estoque');
            }}
            className="text-[11px] font-bold text-[#00687a] dark:text-[#57dffe] hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span>Gestão de Estoque</span>
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  );
};
