/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ActiveScreen, RoleId, CartItem, ProductItem, Client, CompletedSaleData, SuspendedOrder } from './types';
import { INITIAL_PRODUCTS, INITIAL_CLIENTS, RECENT_SALES, SCHEDULE_ITEMS, RBAC_ROLES } from './data/mockData';
import { SideNavBar } from './components/SideNavBar';
import { TopNavBar } from './components/TopNavBar';
import { DashboardView } from './components/DashboardView';
import { PDVView } from './components/PDVView';
import { ClientesView } from './components/ClientesView';
import { FinanceiroView } from './components/FinanceiroView';
import { AuthView } from './components/AuthView';
import { EstoqueView } from './components/EstoqueView';
import { TintometriaModal } from './components/TintometriaModal';
import { HelpModal, CloseCashierModal, FinalizeSaleModal } from './components/Modals';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [recentSales, setRecentSales] = useState(RECENT_SALES);
  const [scheduleItems, setScheduleItems] = useState(SCHEDULE_ITEMS);

  // Initial Cart matching Screen 2 (Frente de Caixa)
  const [cart, setCart] = useState<CartItem[]>([
    { product: INITIAL_PRODUCTS[0], quantity: 2 }, // Látex Premium 18L
    { product: INITIAL_PRODUCTS[1], quantity: 2 }, // Esmalte Sintético 3.6L
    { product: INITIAL_PRODUCTS[5], quantity: 3 }, // Rolo Microfibra 23cm
    { product: INITIAL_PRODUCTS[6], quantity: 1 }, // Massa Corrida 25kg
    { product: INITIAL_PRODUCTS[7], quantity: 1 }, // Aguarrás 900ml
  ]);

  // Suspended / Saved Orders state (persisted temporarily in application state)
  const [savedOrders, setSavedOrders] = useState<SuspendedOrder[]>(() => {
    try {
      const stored = localStorage.getItem('pos_suspended_orders');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pos_suspended_orders', JSON.stringify(savedOrders));
    } catch {}
  }, [savedOrders]);

  // Current Operator
  const [currentUser, setCurrentUser] = useState({
    name: 'Marcos Silva',
    roleId: 'caixa' as RoleId,
    matricula: 'Mat. 1042',
  });

  // Global search query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCloseCashierOpen, setIsCloseCashierOpen] = useState(false);
  const [isTintometriaOpen, setIsTintometriaOpen] = useState(false);
  const [finalizeSaleData, setFinalizeSaleData] = useState<CompletedSaleData | null>(null);

  // Keyboard Accelerators (F1..F12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpOpen(true);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setActiveScreen('pdv');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveScreen('pdv');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setIsTintometriaOpen(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        setIsCloseCashierOpen(true);
      } else if (e.key === 'F12') {
        e.preventDefault();
        if (activeScreen === 'pdv' && cart.length > 0) {
          const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
          const discount = subtotal * 0.05;
          const total = subtotal - discount;
          handleFinalizeSale({
            total,
            paymentMethod: 'PIX DINÂMICO',
            receivedAmount: total,
            changeAmount: 0,
            client: clients[0],
            items: [...cart],
            subtotal,
            discount,
            couponCode: 'PINTOR5',
            timestamp: new Date().toLocaleString('pt-BR'),
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScreen, cart, clients]);

  // Cart operations
  const handleAddToCart = (product: ProductItem, quantity: number = 1) => {
    const qty = Math.max(1, quantity || 1);
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQ = item.quantity + delta;
            return newQ > 0 ? { ...item, quantity: newQ } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleClearCart = () => {
    if (confirm('Deseja realmente cancelar e esvaziar todos os itens da venda atual?')) {
      setCart([]);
    }
  };

  const handleRestoreCart = (items: CartItem[]) => {
    setCart(items);
  };

  const handleFinalizeSale = (summary: CompletedSaleData) => {
    const saleId = `sale-${Date.now()}`;
    const orderNum = `PED-${Math.floor(10000 + Math.random() * 90000)}`;
    const randomNfce = `000.${Math.floor(Math.random() * 800 + 100).toString().padStart(3, '0')}.${Math.floor(Math.random() * 900 + 100).toString().padStart(3, '0')}`;
    const randomAccessKey = `4126 0918 2918 0200 0190 6500 1000 ${Math.floor(Math.random() * 8999 + 1000)} ${Math.floor(Math.random() * 8999 + 1000)} ${Math.floor(Math.random() * 8999 + 1000)}`;

    const fullSaleData: CompletedSaleData = {
      ...summary,
      id: saleId,
      orderNumber: orderNum,
      nfceNumber: randomNfce,
      series: '001',
      accessKey: randomAccessKey,
      protocol: `1412600${Math.floor(1000000 + Math.random() * 9000000)}`,
      operatorName: currentUser.name,
      timestamp: summary.timestamp || new Date().toLocaleString('pt-BR'),
    };

    setFinalizeSaleData(fullSaleData);

    // Deduct stock for sold items
    const soldItems = summary.items || cart;
    setProducts(prevProds =>
      prevProds.map(p => {
        const sold = soldItems.find(item => item.product.id === p.id);
        if (sold) {
          const newStock = Math.max(0, p.stock - sold.quantity);
          const min = p.minStock ?? (p.isCritical ? 15 : 12);
          return {
            ...p,
            stock: newStock,
            isCritical: newStock <= min,
            volumeToday: p.volumeToday + sold.quantity,
            salesTotal: p.salesTotal + p.price * sold.quantity,
          };
        }
        return p;
      })
    );

    // Register sale in recent sales
    const newSale = {
      id: saleId,
      paymentType: summary.paymentMethod,
      paymentBadgeClass: 'bg-[#acedff] text-[#004e5c]',
      clientName: summary.client.name,
      itemsSummary: `${(summary.items?.length || cart.length || 1)} itens batidos no PDV`,
      amount: summary.total,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      operator: currentUser.name.split(' ')[0] + ' S.',
    };

    setRecentSales(prev => [newSale, ...prev.slice(0, 4)]);
    setCart([]);
  };

  const handleUpdateProductStock = (productId: string, newStock: number) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const min = p.minStock ?? 12;
          return {
            ...p,
            stock: newStock,
            isCritical: newStock <= min,
          };
        }
        return p;
      })
    );
  };

  const handleBulkUpdateStock = (updates: { productId: string; newStock: number }[]) => {
    const map = new Map(updates.map(u => [u.productId, u.newStock]));
    setProducts(prev =>
      prev.map(p => {
        if (map.has(p.id)) {
          const newStock = map.get(p.id)!;
          const min = p.minStock ?? 12;
          return {
            ...p,
            stock: newStock,
            isCritical: newStock <= min,
          };
        }
        return p;
      })
    );
  };

  const handleAddCustomFormulaToCart = (customProduct: ProductItem) => {
    setProducts(prev => [customProduct, ...prev]);
    handleAddToCart(customProduct);
    setActiveScreen('pdv');
  };

  const handleLogin = (roleId: RoleId, userName: string, matricula: string) => {
    setCurrentUser({
      roleId,
      name: userName,
      matricula,
    });
    setActiveScreen('dashboard');
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#0e1c2f] flex flex-col font-sans">
      {/* SIDEBAR NAVIGATION (Hidden when in standalone auth screen if desired, or always accessible via switch) */}
      <SideNavBar
        activeScreen={activeScreen}
        onNavigate={(screen) => setActiveScreen(screen)}
        onOpenNewOrder={() => setActiveScreen('pdv')}
        currentUser={currentUser}
        tintometricConnected={true}
        onOpenTintometria={() => setIsTintometriaOpen(true)}
        criticalCount={products.filter(p => (p.stock <= (p.minStock ?? 12)) || p.isCritical).length}
      />

      {/* TOP HEADER BAR */}
      <TopNavBar
        activeScreen={activeScreen}
        currentUser={currentUser}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenCloseCashier={() => setIsCloseCashierOpen(true)}
        onOpenTintometria={() => setIsTintometriaOpen(true)}
        onNavigate={(screen) => setActiveScreen(screen)}
      />

      {/* MAIN CONTENT AREA */}
      <main className="ml-64 pt-16 min-h-screen p-5 overflow-x-hidden">
        {activeScreen === 'dashboard' && (
          <DashboardView
            products={products}
            recentSales={recentSales}
            onSelectProductForSale={(prod) => {
              handleAddToCart(prod);
              setActiveScreen('pdv');
            }}
            onNavigateToPDV={() => setActiveScreen('pdv')}
            onNavigateToFinanceiro={() => setActiveScreen('relatorios')}
            onNavigateToEstoque={() => setActiveScreen('estoque')}
          />
        )}

        {activeScreen === 'estoque' && (
          <EstoqueView
            products={products}
            onUpdateProductStock={handleUpdateProductStock}
            onBulkUpdateStock={handleBulkUpdateStock}
            onNavigateToPDV={(prod) => {
              if (prod) handleAddToCart(prod);
              setActiveScreen('pdv');
            }}
            currentUser={currentUser}
          />
        )}

        {activeScreen === 'pdv' && (
          <PDVView
            products={products}
            clients={clients}
            cart={cart}
            onAddToCart={handleAddToCart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onFinalizeSale={handleFinalizeSale}
            onOpenTintometria={() => setIsTintometriaOpen(true)}
            savedOrders={savedOrders}
            onSetSavedOrders={setSavedOrders}
            onRestoreCart={handleRestoreCart}
          />
        )}

        {activeScreen === 'clientes' && (
          <ClientesView
            clients={clients}
            onSelectClientForPDV={(c) => {
              alert(`Cliente ${c.name} vinculado à nova venda do PDV.`);
              setActiveScreen('pdv');
            }}
            onOpenNewClientModal={() => {
              const name = prompt('Nome ou Razão Social do Novo Cliente:');
              if (name) {
                const newCli: Client = {
                  id: `cli-${Date.now()}`,
                  code: `#CLI-${Math.floor(1000 + Math.random() * 9000)}`,
                  name,
                  doc: '22.333.444/0001-55',
                  docType: 'CNPJ',
                  segment: 'Empreiteira',
                  creditLimit: 20000,
                  creditUsed: 0,
                  paymentTerm: 'Boleto 28d',
                  score: 'Score A (95%)',
                  scorePercent: 95,
                  status: 'liberado',
                  openInvoices: 0,
                  openAmount: 0,
                  email: 'compras@cliente.com.br',
                  phone: '(11) 99999-8888',
                  pixKey: '22.333.444/0001-55',
                  duplicatas: []
                };
                setClients(prev => [newCli, ...prev]);
              }
            }}
          />
        )}

        {activeScreen === 'relatorios' && (
          <FinanceiroView
            scheduleItems={scheduleItems}
            onOpenNewExpenseModal={() => {
              const desc = prompt('Descrição do Pagamento / Fornecedor:');
              const val = prompt('Valor (R$):');
              if (desc && val) {
                const newItem = {
                  id: `sch-${Date.now()}`,
                  title: desc,
                  sub: 'Lançamento Manual de Caixa',
                  date: 'Hoje',
                  dateBadge: 'Lançado',
                  category: 'Matéria Prima / Revenda',
                  categoryBadgeClass: 'bg-[#e7eeff] text-[#00687a]',
                  amount: parseFloat(val) || 0,
                  isExpense: true,
                  statusText: 'Agendado',
                  statusColor: 'bg-amber-50 text-amber-800 border-amber-200'
                };
                setScheduleItems(prev => [newItem, ...prev]);
              }
            }}
          />
        )}

        {activeScreen === 'auth' && (
          <AuthView onLogin={handleLogin} />
        )}
      </main>

      {/* MODALS */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <CloseCashierModal isOpen={isCloseCashierOpen} onClose={() => setIsCloseCashierOpen(false)} />
      <FinalizeSaleModal
        isOpen={finalizeSaleData !== null}
        onClose={() => setFinalizeSaleData(null)}
        saleData={finalizeSaleData}
      />
      <TintometriaModal
        isOpen={isTintometriaOpen}
        onClose={() => setIsTintometriaOpen(false)}
        onAddCustomFormulaToCart={handleAddCustomFormulaToCart}
      />
    </div>
  );
}
