import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { StockToastItem, ProductItem } from '../types';
import { INITIAL_PRODUCTS } from '../data/mockData';

interface NotificationContextType {
  toasts: StockToastItem[];
  allAlerts: StockToastItem[];
  unreadCount: number;
  triggerStockAlert: (item: Omit<StockToastItem, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => void;
  dismissToast: (id: string) => void;
  dismissAlert: (id: string) => void;
  clearAllAlerts: () => void;
  markAllAsRead: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  testStockAlert: (customProduct?: ProductItem) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Web Audio API soft alert chime (no external audio assets required)
function playStockAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Two-tone warning beep: 659.25Hz (E5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio context may be restricted by browser until user gesture
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<StockToastItem[]>([]);
  const [allAlerts, setAllAlerts] = useState<StockToastItem[]>(() => {
    try {
      const saved = localStorage.getItem('marquescolor_stock_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('marquescolor_alert_sound');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Sync allAlerts with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('marquescolor_stock_alerts', JSON.stringify(allAlerts));
    } catch {}
  }, [allAlerts]);

  // Sync sound settings with localStorage
  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
    try {
      localStorage.setItem('marquescolor_alert_sound', JSON.stringify(enabled));
    } catch {}
  };

  // Dismiss a toast from the active floating stack
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Dismiss an alert from history
  const dismissAlert = useCallback((id: string) => {
    setAllAlerts(prev => prev.filter(a => a.id !== id));
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setAllAlerts([]);
    setToasts([]);
    setUnreadCount(0);
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Avoid spamming duplicate alerts for the same product within 10 seconds
  const lastAlertTimes = useRef<Record<string, number>>({});

  // Main alert trigger
  const triggerStockAlert = useCallback((item: Omit<StockToastItem, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
    const now = Date.now();
    const lastTime = lastAlertTimes.current[item.productId] || 0;
    // Debounce duplicate alerts for same product within 4 seconds
    if (now - lastTime < 4000) {
      return;
    }
    lastAlertTimes.current[item.productId] = now;

    const newToast: StockToastItem = {
      ...item,
      id: item.id || `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: item.timestamp || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    // Play chime if enabled
    if (soundEnabled) {
      playStockAlertSound();
    }

    // Add to toasts (limit active stack to 4 to prevent screen clutter)
    setToasts(prev => [newToast, ...prev.slice(0, 3)]);

    // Add to allAlerts history (limit to 30)
    setAllAlerts(prev => {
      const filtered = prev.filter(a => a.productId !== item.productId);
      return [newToast, ...filtered.slice(0, 29)];
    });

    setUnreadCount(prev => prev + 1);
  }, [soundEnabled]);

  // Test Stock Alert Simulator
  const testStockAlert = useCallback((customProduct?: ProductItem) => {
    let prod = customProduct;
    if (!prod) {
      // Pick a critical product or random from initial catalog
      const criticals = INITIAL_PRODUCTS.filter(p => (p.stock <= (p.minStock ?? 12)) || p.isCritical);
      prod = criticals.length > 0 ? criticals[Math.floor(Math.random() * criticals.length)] : INITIAL_PRODUCTS[2];
    }

    const currentStock = Math.floor(Math.random() * 3) + 1; // 1 to 3 units
    const minStock = prod.minStock ?? 12;

    triggerStockAlert({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      brand: prod.brand,
      swatchHex: prod.swatchHex,
      swatchDot: prod.swatchDot,
      currentStock,
      minStock,
      stockUnit: prod.stockUnit || 'latas',
      type: currentStock === 0 ? 'out_of_stock' : 'critical',
      title: currentStock === 0 ? 'Ruptura Total de Estoque!' : 'Alerta de Nível Crítico!',
      message: `Estoque atingiu apenas ${currentStock} ${prod.stockUnit}. Limite de segurança é ${minStock} ${prod.stockUnit}.`,
    });
  }, [triggerStockAlert]);

  return (
    <NotificationContext.Provider
      value={{
        toasts,
        allAlerts,
        unreadCount,
        triggerStockAlert,
        dismissToast,
        dismissAlert,
        clearAllAlerts,
        markAllAsRead,
        soundEnabled,
        setSoundEnabled,
        testStockAlert,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
