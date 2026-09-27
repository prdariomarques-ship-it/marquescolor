import React, { useEffect, useState, useRef } from 'react';
import { StockToastItem, ActiveScreen } from '../types';
import { useNotification } from '../context/NotificationContext';

interface StockToastContainerProps {
  onNavigate?: (screen: ActiveScreen) => void;
}

const SINGLE_TOAST_DURATION = 8000; // 8 seconds auto-dismiss

interface ToastCardProps {
  toast: StockToastItem;
  onDismiss: (id: string) => void;
  onNavigate?: (screen: ActiveScreen) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss, onNavigate }) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(SINGLE_TOAST_DURATION);

  useEffect(() => {
    if (isPaused) return;

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newRemaining = Math.max(0, remainingTimeRef.current - elapsed);
      const pct = (newRemaining / SINGLE_TOAST_DURATION) * 100;
      setProgress(pct);

      if (newRemaining <= 0) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => {
      clearInterval(interval);
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - (Date.now() - startTimeRef.current));
    };
  }, [isPaused, onDismiss, toast.id]);

  const isOutOfStock = toast.currentStock <= 0;
  const isSevere = isOutOfStock || toast.currentStock <= Math.floor(toast.minStock * 0.3);

  const handleAction = () => {
    onDismiss(toast.id);
    if (onNavigate) {
      onNavigate('estoque');
    }
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="pointer-events-auto w-full bg-white dark:bg-[#1a273b] border-2 border-[#ba1a1a] dark:border-red-500/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-top-4 fade-in group hover:shadow-red-500/20 hover:scale-[1.01]"
      style={{
        boxShadow: '0 12px 30px -4px rgba(186, 26, 26, 0.25), 0 4px 12px -2px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Top Header Strip */}
      <div className="bg-gradient-to-r from-[#ba1a1a] via-[#93000a] to-[#700005] text-white px-3.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Animated Warning Beacon */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-80"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </span>
          <span className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>{isOutOfStock ? 'Ruptura Total de Estoque' : 'Estoque Crítico Atingido'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-red-200 font-mono">
            {toast.timestamp}
          </span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="w-5 h-5 rounded flex items-center justify-center text-red-200 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            title="Fechar Notificação"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Toast Content Body */}
      <div className="p-3.5 space-y-3">
        <div className="flex items-start gap-3">
          {/* Product Swatch or Icon */}
          <div
            className="w-10 h-10 rounded-xl shadow-inner flex items-center justify-center shrink-0 border border-black/10 relative"
            style={{ backgroundColor: toast.swatchHex || '#f1f5f9' }}
          >
            {toast.swatchDot ? (
              <span
                className="w-3.5 h-3.5 rounded-full ring-2 ring-white/80 shadow-xs"
                style={{ backgroundColor: toast.swatchDot }}
              />
            ) : (
              <span className="material-symbols-outlined text-lg text-slate-700">format_paint</span>
            )}
            {/* Alert badge over swatch */}
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#ba1a1a] text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs">
              !
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs text-[#001229] dark:text-white truncate">
                {toast.productName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#74777e] dark:text-slate-300 mt-0.5">
              <span className="font-mono bg-[#f0f3ff] dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px] text-[#001229] dark:text-slate-200 border border-[#c4c6ce]/30">
                {toast.sku}
              </span>
              <span>•</span>
              <span className="font-semibold text-[#00687a] dark:text-[#57dffe]">{toast.brand}</span>
            </div>
          </div>
        </div>

        {/* Stock Level Metric Comparison Box */}
        <div className="p-2.5 rounded-xl bg-red-50/80 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400">
              Estoque Restante
            </div>
            <div className="font-mono font-extrabold text-base text-[#ba1a1a] dark:text-red-400 flex items-baseline gap-1">
              <span>{toast.currentStock}</span>
              <span className="text-xs font-normal text-red-800 dark:text-red-300">
                {toast.stockUnit || 'latas'}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
              Estoque Mínimo Seguro
            </div>
            <div className="font-mono font-bold text-xs text-[#001229] dark:text-slate-200">
              {toast.minStock} {toast.stockUnit || 'latas'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => onDismiss(toast.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#44474d] dark:text-slate-300 hover:bg-[#f0f3ff] dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Dispensar
          </button>

          <button
            onClick={handleAction}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-98"
          >
            <span className="material-symbols-outlined text-sm">inventory_2</span>
            <span>Repor no Estoque ➔</span>
          </button>
        </div>
      </div>

      {/* Progress Auto-Dismiss Timer Bar */}
      <div className="w-full h-1 bg-red-100 dark:bg-red-950 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#ba1a1a] to-red-400 transition-all ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export const StockToastContainer: React.FC<StockToastContainerProps> = ({ onNavigate }) => {
  const { toasts, dismissToast, testStockAlert } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none px-3 sm:px-0">
      {toasts.map(toast => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};
