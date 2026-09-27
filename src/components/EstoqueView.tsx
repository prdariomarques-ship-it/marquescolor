import React, { useState, useMemo, useEffect } from 'react';
import { ProductItem, RoleId, StockAdjustmentRecord, PurchaseOrderItem } from '../types';

interface EstoqueViewProps {
  products: ProductItem[];
  onUpdateProductStock: (productId: string, newStock: number, record?: Partial<StockAdjustmentRecord>) => void;
  onBulkUpdateStock?: (updates: { productId: string; newStock: number }[], note?: string) => void;
  onNavigateToPDV?: (product?: ProductItem) => void;
  currentUser: {
    name: string;
    roleId: RoleId;
    matricula: string;
  };
}

export const EstoqueView: React.FC<EstoqueViewProps> = ({
  products,
  onUpdateProductStock,
  onBulkUpdateStock,
  onNavigateToPDV,
  currentUser,
}) => {
  // Filters & Parameters
  const [filterTab, setFilterTab] = useState<'criticos' | 'todos' | 'zerados' | 'saudaveis'>('criticos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [selectedBrand, setSelectedBrand] = useState<string>('todas');
  const [selectedCoverageDays, setSelectedCoverageDays] = useState<number>(30); // 15, 30, 45, 60 days of safety stock

  // Modal States
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'set' | 'add' | 'sub' | 'min_stock'>('set');
  const [adjustmentValue, setAdjustmentValue] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState<'inventario' | 'avaria' | 'entrada_nf' | 'consumo_interno' | 'ajuste_rapido'>('inventario');
  const [adjustmentNote, setAdjustmentNote] = useState('');

  // Purchase Order Suggestion Modal
  const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = useState(false);
  const [purchaseOrderList, setPurchaseOrderList] = useState<PurchaseOrderItem[]>([]);
  const [purchaseOrderFilterBrand, setPurchaseOrderFilterBrand] = useState<string>('todos');
  const [purchaseOrderSuccess, setPurchaseOrderSuccess] = useState<string | null>(null);

  // Audit History / Log State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<StockAdjustmentRecord[]>(() => {
    try {
      const stored = localStorage.getItem('pos_stock_audit_log');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      {
        id: 'adj-1',
        productId: 'prod-3',
        productName: 'Resina Impermeabilizante Multiuso 18L',
        sku: 'LUK-RES-018',
        brand: 'Lukscolor',
        previousStock: 6,
        newStock: 2,
        delta: -4,
        reason: 'avaria',
        reasonText: 'Avaria no transporte / Tampa rompida no depósito',
        operator: 'Carlos S. (Gerente)',
        timestamp: new Date(Date.now() - 3600000 * 4).toLocaleString('pt-BR'),
      },
      {
        id: 'adj-2',
        productId: 'prod-1',
        productName: 'Tinta Acrílica Toque Suave Fosco 18L',
        sku: 'SUV-ACR-018',
        brand: 'Suvinil',
        previousStock: 36,
        newStock: 48,
        delta: 12,
        reason: 'entrada_nf',
        reasonText: 'Recebimento de Lote NF 004.912 Suvinil Tintas',
        operator: 'Carlos S. (Gerente)',
        timestamp: new Date(Date.now() - 3600000 * 18).toLocaleString('pt-BR'),
      },
      {
        id: 'adj-3',
        productId: 'prod-15',
        productName: 'Massa Poliéster Automotiva 1kg c/ Catalisador',
        sku: 'MAX-MAS-010',
        brand: 'Maxi Rubber',
        previousStock: 40,
        newStock: 36,
        delta: -4,
        reason: 'inventario',
        reasonText: 'Ajuste após contagem física periódica de prateleira',
        operator: 'Marcos Silva (Caixa)',
        timestamp: new Date(Date.now() - 3600000 * 28).toLocaleString('pt-BR'),
      },
    ];
  });

  // Notification Toast
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const triggerNotification = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Persist audit log
  useEffect(() => {
    try {
      localStorage.setItem('pos_stock_audit_log', JSON.stringify(auditLog));
    } catch {}
  }, [auditLog]);

  // Derived product stock parameters
  const enrichedProducts = useMemo(() => {
    return products.map(p => {
      const minStock = p.minStock ?? (p.isCritical ? 15 : 12);
      const maxStock = p.maxStock ?? 50;
      const costPrice = p.costPrice ?? Math.round(p.price * 0.62 * 100) / 100;
      const avgDailySales = p.avgDailySales ?? Math.max(1, Math.round(p.volumeToday * 0.8) || 3);
      const daysCoverage = avgDailySales > 0 ? (p.stock / avgDailySales) : 99;
      const isCritical = p.stock <= minStock || p.isCritical === true;
      const isOutOfStock = p.stock === 0;

      // Calculate suggested purchase quantity based on average daily sales and desired coverage
      const projectedDemand = avgDailySales * selectedCoverageDays;
      const neededRaw = Math.max(0, (projectedDemand + minStock) - p.stock);
      const packMultiple = p.stockUnit === 'galões' ? 4 : p.stockUnit === 'latas' ? 2 : p.stockUnit === 'kits' ? 2 : 6;
      const suggestedPurchaseQty = neededRaw > 0 ? Math.ceil(neededRaw / packMultiple) * packMultiple : 0;

      const location = p.location ?? (
        p.category === 'imobiliaria' ? 'Corredor A-01 / Prateleira 2' :
        p.category === 'automotiva' ? 'Corredor C-03 / Box Tintas' :
        p.category === 'complementos' ? 'Corredor B-02 / Prateleira 1' :
        p.category === 'vernizes' ? 'Corredor A-03 / Prateleira 4' :
        'Corredor D-01 / Acessórios'
      );

      return {
        ...p,
        minStock,
        maxStock,
        costPrice,
        avgDailySales,
        daysCoverage,
        isCritical,
        isOutOfStock,
        suggestedPurchaseQty,
        location,
        packMultiple,
      };
    });
  }, [products, selectedCoverageDays]);

  // High-level inventory KPI telemetry
  const stats = useMemo(() => {
    const totalItems = enrichedProducts.length;
    const criticalItems = enrichedProducts.filter(p => p.isCritical);
    const criticalCount = criticalItems.length;
    const outOfStockCount = enrichedProducts.filter(p => p.isOutOfStock).length;
    const healthyCount = enrichedProducts.filter(p => !p.isCritical && !p.isOutOfStock).length;

    const totalStockUnits = enrichedProducts.reduce((acc, p) => acc + p.stock, 0);
    const totalInventoryCost = enrichedProducts.reduce((acc, p) => acc + p.stock * p.costPrice, 0);
    const totalInventoryValue = enrichedProducts.reduce((acc, p) => acc + p.stock * p.price, 0);

    const itemsNeedingOrder = enrichedProducts.filter(p => p.suggestedPurchaseQty > 0);
    const totalSuggestedOrderCost = itemsNeedingOrder.reduce((acc, p) => acc + p.suggestedPurchaseQty * p.costPrice, 0);
    const totalSuggestedUnits = itemsNeedingOrder.reduce((acc, p) => acc + p.suggestedPurchaseQty, 0);

    return {
      totalItems,
      criticalCount,
      outOfStockCount,
      healthyCount,
      totalStockUnits,
      totalInventoryCost,
      totalInventoryValue,
      itemsNeedingOrderCount: itemsNeedingOrder.length,
      totalSuggestedOrderCost,
      totalSuggestedUnits,
      criticalItems,
    };
  }, [enrichedProducts]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return enrichedProducts.filter(p => {
      // Tab filter
      if (filterTab === 'criticos' && !p.isCritical) return false;
      if (filterTab === 'zerados' && !p.isOutOfStock) return false;
      if (filterTab === 'saudaveis' && p.isCritical) return false;

      // Category filter
      if (selectedCategory !== 'todas' && p.category !== selectedCategory) return false;

      // Brand filter
      if (selectedBrand !== 'todas' && p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;

      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku.toLowerCase().includes(q);
        const matchesBarcode = p.barcode?.toLowerCase().includes(q) || false;
        const matchesColor = p.colorName.toLowerCase().includes(q);
        const matchesBrand = p.brand.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode && !matchesColor && !matchesBrand) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedProducts, filterTab, selectedCategory, selectedBrand, searchQuery]);

  // Unique brands list for filter
  const brands = useMemo(() => {
    const set = new Set<string>();
    enrichedProducts.forEach(p => set.add(p.brand));
    return Array.from(set).sort();
  }, [enrichedProducts]);

  // Handle open manual adjustment modal
  const handleOpenAdjustment = (product: ProductItem, defaultType: 'set' | 'add' | 'sub' | 'min_stock' = 'set') => {
    setSelectedProduct(product);
    setAdjustmentType(defaultType);
    setAdjustmentValue(defaultType === 'set' ? String(product.stock) : defaultType === 'min_stock' ? String(product.minStock ?? 12) : '1');
    setAdjustmentReason('inventario');
    setAdjustmentNote('');
    setIsAdjustmentModalOpen(true);
  };

  // Quick inline increment / decrement by delta
  const handleQuickDelta = (product: ProductItem, delta: number) => {
    const current = product.stock;
    const newStock = Math.max(0, current + delta);
    if (newStock === current) return;

    const record: StockAdjustmentRecord = {
      id: `adj-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      brand: product.brand,
      previousStock: current,
      newStock,
      delta,
      reason: 'ajuste_rapido',
      reasonText: `Ajuste rápido de balcão (${delta > 0 ? `+${delta}` : delta} ${product.stockUnit})`,
      operator: currentUser.name,
      timestamp: new Date().toLocaleString('pt-BR'),
    };

    onUpdateProductStock(product.id, newStock, record);
    setAuditLog(prev => [record, ...prev]);
    triggerNotification(`Saldo de "${product.name}" ajustado: ${current} ➔ ${newStock} ${product.stockUnit}`);
  };

  // Submit manual adjustment from modal
  const handleSaveAdjustment = () => {
    if (!selectedProduct) return;
    const numVal = parseInt(adjustmentValue, 10);
    if (isNaN(numVal) || numVal < 0) {
      alert('Por favor, informe uma quantidade numérica válida e não-negativa.');
      return;
    }

    let newStock = selectedProduct.stock;
    let delta = 0;
    let reasonText = '';

    if (adjustmentType === 'set') {
      newStock = numVal;
      delta = newStock - selectedProduct.stock;
      reasonText = adjustmentNote.trim() || `Contagem física de inventário (Saldo corrigido para ${newStock})`;
    } else if (adjustmentType === 'add') {
      newStock = selectedProduct.stock + numVal;
      delta = numVal;
      reasonText = adjustmentNote.trim() || `Entrada manual de +${numVal} ${selectedProduct.stockUnit}`;
    } else if (adjustmentType === 'sub') {
      newStock = Math.max(0, selectedProduct.stock - numVal);
      delta = -Math.min(selectedProduct.stock, numVal);
      reasonText = adjustmentNote.trim() || `Baixa manual de ${delta} ${selectedProduct.stockUnit} por avaria/perda`;
    } else if (adjustmentType === 'min_stock') {
      // Update minimum threshold
      const updatedProduct: ProductItem = {
        ...selectedProduct,
        minStock: numVal,
        isCritical: selectedProduct.stock <= numVal,
      };
      onUpdateProductStock(selectedProduct.id, selectedProduct.stock, {
        reason: 'inventario',
        reasonText: `Nível crítico mínimo atualizado para ${numVal} ${selectedProduct.stockUnit}`,
      });
      setIsAdjustmentModalOpen(false);
      triggerNotification(`Nível de alerta crítico de "${selectedProduct.name}" atualizado para ${numVal} ${selectedProduct.stockUnit}`);
      return;
    }

    const record: StockAdjustmentRecord = {
      id: `adj-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      brand: selectedProduct.brand,
      previousStock: selectedProduct.stock,
      newStock,
      delta,
      reason: adjustmentReason,
      reasonText,
      operator: currentUser.name,
      timestamp: new Date().toLocaleString('pt-BR'),
    };

    onUpdateProductStock(selectedProduct.id, newStock, record);
    setAuditLog(prev => [record, ...prev]);
    setIsAdjustmentModalOpen(false);
    triggerNotification(`Estoque de "${selectedProduct.name}" atualizado para ${newStock} ${selectedProduct.stockUnit}.`);
  };

  // Open the Automatic Purchase Order Suggestion Drawer / Modal
  const handleOpenPurchaseOrderSuggestion = () => {
    // Generate order items for all products with suggested quantity > 0
    const items: PurchaseOrderItem[] = enrichedProducts
      .filter(p => p.suggestedPurchaseQty > 0 || p.isCritical)
      .map(p => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        stockUnit: p.stockUnit,
        currentStock: p.stock,
        minStock: p.minStock,
        avgDailySales: p.avgDailySales,
        daysCoverage: p.daysCoverage,
        suggestedQty: p.suggestedPurchaseQty > 0 ? p.suggestedPurchaseQty : p.packMultiple * 4,
        orderQty: p.suggestedPurchaseQty > 0 ? p.suggestedPurchaseQty : p.packMultiple * 4,
        costPrice: p.costPrice,
        sellingPrice: p.price,
        selected: true,
      }));

    setPurchaseOrderList(items);
    setPurchaseOrderFilterBrand('todos');
    setPurchaseOrderSuccess(null);
    setIsPurchaseOrderModalOpen(true);
  };

  // Toggle selection of items in purchase order
  const handleToggleOrderItem = (productId: string) => {
    setPurchaseOrderList(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Update order quantity manually in purchase order preview
  const handleUpdateOrderQty = (productId: string, qty: number) => {
    setPurchaseOrderList(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, orderQty: Math.max(0, qty) } : item
      )
    );
  };

  // Execute Receiving Goods (Efetivar Entrada no Estoque)
  const handleFulfillPurchaseOrder = () => {
    const selectedItems = purchaseOrderList.filter(item => item.selected && item.orderQty > 0);
    if (selectedItems.length === 0) {
      alert('Nenhum item selecionado para entrada de mercadoria.');
      return;
    }

    if (!confirm(`Confirmar entrada no estoque de ${selectedItems.length} produtos recebidos no total de ${selectedItems.reduce((acc, i) => acc + i.orderQty, 0)} unidades?`)) {
      return;
    }

    const updates = selectedItems.map(item => ({
      productId: item.productId,
      newStock: item.currentStock + item.orderQty,
    }));

    // Record in audit log
    const timestamp = new Date().toLocaleString('pt-BR');
    const newRecords: StockAdjustmentRecord[] = selectedItems.map(item => ({
      id: `adj-${Date.now()}-${Math.random()}`,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      brand: item.brand,
      previousStock: item.currentStock,
      newStock: item.currentStock + item.orderQty,
      delta: item.orderQty,
      reason: 'entrada_nf',
      reasonText: `Recebimento de Pedido de Compra Reposição (+${item.orderQty} ${item.stockUnit})`,
      operator: currentUser.name,
      timestamp,
    }));

    if (onBulkUpdateStock) {
      onBulkUpdateStock(updates, 'Recebimento de Pedido de Compra');
    } else {
      updates.forEach(u => onUpdateProductStock(u.productId, u.newStock));
    }

    setAuditLog(prev => [...newRecords, ...prev]);
    setIsPurchaseOrderModalOpen(false);
    triggerNotification(`✓ Entrada de mercadoria confirmada! ${selectedItems.length} produtos foram reabastecidos no estoque.`);
  };

  return (
    <div className="space-y-6">
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-bounce text-sm ${
            notification.type === 'success'
              ? 'bg-[#004e5c] text-white border-[#57dffe]'
              : notification.type === 'warning'
              ? 'bg-amber-800 text-white border-amber-400'
              : 'bg-[#001229] text-white border-white/20'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {notification.type === 'success' ? 'check_circle' : 'info'}
          </span>
          <span className="font-semibold">{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-2 text-white/70 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* TOP HEADER & ACTION CONTROLS */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/40 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] text-[#00687a] flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-2xl font-bold">inventory_2</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#001229] flex items-center gap-2">
                  Gestão de Estoque & Reposição
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#acedff] text-[#004e5c]">
                    Telemetria de Ruptura
                  </span>
                </h1>
                <p className="text-xs text-[#44474d] mt-0.5">
                  Monitoramento de saldos críticos, controle de inventário manual e sugestão preditiva de pedidos de compra
                </p>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Sugerir Pedido de Compra Inteligente */}
            <button
              type="button"
              onClick={handleOpenPurchaseOrderSuggestion}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#00687a] hover:bg-[#004e5c] text-white text-xs font-bold shadow-xs transition-all active:scale-98 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">shopping_cart_checkout</span>
              <span>Sugerir Pedidos de Compra</span>
              {stats.criticalCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold">
                  {stats.criticalCount}
                </span>
              )}
            </button>

            {/* 2. Histórico de Auditoria */}
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#f0f3ff] hover:bg-[#dee8ff] border border-[#c4c6ce]/50 text-[#001229] text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-base text-[#00687a]">history</span>
              <span>Auditoria / Ajustes ({auditLog.length})</span>
            </button>

            {/* 3. Exportar Inventário */}
            <button
              type="button"
              onClick={() => {
                alert(`Relatório de Estoque Gerado com sucesso:\n- ${stats.totalItems} produtos catalogados\n- ${stats.criticalCount} em nível crítico\n- Valor de Custo Total: R$ ${stats.totalInventoryCost.toFixed(2)}`);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#f0f3ff] border border-[#c4c6ce]/50 text-[#44474d] hover:text-[#001229] text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">file_download</span>
              <span>Exportar Inventário</span>
            </button>
          </div>
        </div>

        {/* 5 KPI Bento Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mt-5 pt-4 border-t border-[#c4c6ce]/30">
          {/* Card 1: Itens em Nível Crítico */}
          <div
            onClick={() => setFilterTab('criticos')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              filterTab === 'criticos'
                ? 'bg-[#ffdad6]/40 border-[#ba1a1a] shadow-xs'
                : 'bg-white border-[#ba1a1a]/30 hover:border-[#ba1a1a]'
            }`}
          >
            <div className="flex items-center justify-between text-[#ba1a1a] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Saldo Crítico</span>
              <span className="material-symbols-outlined text-lg">warning</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#93000a]">
              {stats.criticalCount}{' '}
              <span className="text-xs font-normal text-[#44474d]">produtos</span>
            </div>
            <div className="text-[11px] text-[#ba1a1a] mt-1 font-medium">
              Abaixo do estoque mínimo
            </div>
          </div>

          {/* Card 2: Ruptura Total (Zerados) */}
          <div
            onClick={() => setFilterTab('zerados')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              filterTab === 'zerados'
                ? 'bg-amber-100 border-amber-500 shadow-xs'
                : 'bg-white border-[#c4c6ce]/40 hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between text-[#d97706] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Esgotados</span>
              <span className="material-symbols-outlined text-lg">error_outline</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#001229]">
              {stats.outOfStockCount}{' '}
              <span className="text-xs font-normal text-[#44474d]">zerados</span>
            </div>
            <div className="text-[11px] text-[#74777e] mt-1 font-medium">
              Vendas perdidas no balcão
            </div>
          </div>

          {/* Card 3: Valor Total em Estoque (Custo) */}
          <div className="p-3.5 rounded-xl border border-[#c4c6ce]/40 bg-white">
            <div className="flex items-center justify-between text-[#00687a] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Valor em Estoque</span>
              <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
            </div>
            <div className="text-xl font-bold font-mono text-[#001229]">
              R$ {stats.totalInventoryCost.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-[#74777e] mt-1">
              Venda: R$ {stats.totalInventoryValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Card 4: Volume Físico Total */}
          <div className="p-3.5 rounded-xl border border-[#c4c6ce]/40 bg-white">
            <div className="flex items-center justify-between text-[#0f2744] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Volume Físico</span>
              <span className="material-symbols-outlined text-lg">layers</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#001229]">
              {stats.totalStockUnits}{' '}
              <span className="text-xs font-normal text-[#44474d]">embalagens</span>
            </div>
            <div className="text-[11px] text-[#74777e] mt-1">
              {stats.totalItems} referências ativas
            </div>
          </div>

          {/* Card 5: Sugestão de Reposição */}
          <div
            onClick={handleOpenPurchaseOrderSuggestion}
            className="p-3.5 rounded-xl border border-[#00687a]/40 bg-[#f0f3ff]/60 hover:bg-[#dee8ff] transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[#00687a] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Reposição Sugerida</span>
              <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
                add_shopping_cart
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-[#00687a]">
              R$ {stats.totalSuggestedOrderCost.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-[#004e5c] mt-1 font-semibold flex items-center gap-1">
              <span>{stats.itemsNeedingOrderCount} itens a repor</span>
              <span>➔</span>
            </div>
          </div>
        </div>
      </section>

      {/* FILTER & PARAMETERS TOOLBAR */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/40 p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Main Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#f0f3ff]/70 border border-[#dee8ff]">
            <button
              type="button"
              onClick={() => setFilterTab('criticos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'criticos'
                  ? 'bg-[#ba1a1a] text-white shadow-xs'
                  : 'text-[#93000a] hover:bg-[#ffdad6]/60'
              }`}
            >
              <span className="material-symbols-outlined text-sm">warning</span>
              <span>Saldo Crítico ({stats.criticalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('todos')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterTab === 'todos'
                  ? 'bg-[#001229] text-white shadow-xs'
                  : 'text-[#44474d] hover:text-[#001229] hover:bg-white'
              }`}
            >
              Todos os Produtos ({stats.totalItems})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('zerados')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterTab === 'zerados'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-[#74777e] hover:text-[#001229] hover:bg-white'
              }`}
            >
              Zerados / Ruptura ({stats.outOfStockCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('saudaveis')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterTab === 'saudaveis'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-[#74777e] hover:text-[#001229] hover:bg-white'
              }`}
            >
              Estoque Saudável ({stats.healthyCount})
            </button>
          </div>

          {/* Search & Dynamic Coverage Parameter Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-sm text-[#74777e]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar SKU, código, nome, marca..."
                className="pl-8 pr-3 py-1.5 text-xs bg-[#f0f3ff]/40 border border-[#c4c6ce]/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00687a] w-56 sm:w-64"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-xs text-[#74777e] hover:text-[#001229] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-[#c4c6ce]/50 text-[#44474d] hover:text-[#001229] bg-white cursor-pointer"
            >
              <option value="todas">Todas Categorias</option>
              <option value="imobiliaria">Imobiliária</option>
              <option value="automotiva">Automotiva</option>
              <option value="vernizes">Vernizes & Madeiras</option>
              <option value="complementos">Complementos / Funilaria</option>
              <option value="acessorios">Acessórios</option>
              <option value="preparacao">Preparação</option>
              <option value="metais">Metais</option>
            </select>

            {/* Brand Dropdown */}
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-[#c4c6ce]/50 text-[#44474d] hover:text-[#001229] bg-white cursor-pointer"
            >
              <option value="todas">Todos Fabricantes</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* Desired Safety Stock Days Coverage */}
            <div className="flex items-center gap-1.5 pl-1 border-l border-[#c4c6ce]/40">
              <span className="text-[11px] text-[#74777e] whitespace-nowrap">Cobertura Compra:</span>
              <select
                value={selectedCoverageDays}
                onChange={(e) => setSelectedCoverageDays(Number(e.target.value))}
                className="px-2 py-1.5 text-xs font-bold text-[#00687a] bg-[#f0f3ff] rounded-lg border border-[#c4c6ce]/50 cursor-pointer"
                title="Dias de estoque desejado para o cálculo automático de reposição"
              >
                <option value={15}>15 dias de vendas</option>
                <option value={30}>30 dias (Padrão)</option>
                <option value={45}>45 dias</option>
                <option value={60}>60 dias</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTS INVENTORY TABLE */}
      <section className="bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff]/80 border-b border-[#c4c6ce]/40 text-[11px] text-[#74777e] uppercase tracking-wider h-10">
                <th className="py-2.5 px-4 font-bold">Produto & Referência</th>
                <th className="py-2.5 px-3 font-bold">Fabricante & Categoria</th>
                <th className="py-2.5 px-3 font-bold">Localização</th>
                <th className="py-2.5 px-3 font-bold text-center">Nível Mínimo</th>
                <th className="py-2.5 px-4 font-bold text-center">Saldo Atual & Status</th>
                <th className="py-2.5 px-3 font-bold text-right">Média Venda / Cobertura</th>
                <th className="py-2.5 px-3 font-bold text-center bg-amber-50/60 border-x border-amber-200/50">
                  Sugestão Compra ({selectedCoverageDays}d)
                </th>
                <th className="py-2.5 px-4 font-bold text-center">Ajuste Manual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4c6ce]/20 text-xs">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#74777e]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-4xl text-[#c4c6ce]">inventory</span>
                      <p className="font-semibold text-sm text-[#001229]">Nenhum produto encontrado neste filtro</p>
                      <p className="text-xs text-[#74777e]">Alterne as abas ou limpe os termos de pesquisa.</p>
                      <button
                        type="button"
                        onClick={() => { setFilterTab('todos'); setSearchQuery(''); setSelectedCategory('todas'); setSelectedBrand('todas'); }}
                        className="mt-2 px-3 py-1.5 text-xs rounded bg-[#00687a] text-white font-semibold cursor-pointer"
                      >
                        Exibir Todos os Produtos
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const percentOfMin = Math.min(100, Math.round((p.stock / Math.max(1, p.minStock)) * 100));

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#f0f3ff]/40 transition-colors ${
                        p.isOutOfStock
                          ? 'bg-amber-50/30'
                          : p.isCritical
                          ? 'bg-[#ffdad6]/15'
                          : ''
                      }`}
                    >
                      {/* Product Name & SKU */}
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          {/* Color Swatch Dot */}
                          <div
                            className="w-7 h-7 rounded-md shadow-inner flex items-center justify-center border border-black/10 shrink-0 mt-0.5"
                            style={{ backgroundColor: p.swatchHex }}
                            title={`Cor: ${p.colorName}`}
                          >
                            {p.swatchDot && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: p.swatchDot }}
                              />
                            )}
                          </div>

                          <div>
                            <div className="font-bold text-[#001229] leading-tight">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-[#74777e]">
                              <span className="bg-[#f0f3ff] px-1.5 py-0.2 rounded border border-[#c4c6ce]/40 font-bold text-[#001229]">
                                {p.sku}
                              </span>
                              {p.barcode && <span>• EAN {p.barcode}</span>}
                              {p.baseType && (
                                <span className="px-1 rounded bg-[#dee8ff] text-[#001229] font-bold">
                                  Base {p.baseType}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Brand & Category */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#001229]">{p.brand}</div>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f3ff] text-[#44474d] border border-[#c4c6ce]/30 capitalize">
                          {p.category}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-3 font-mono text-[11px] text-[#44474d]">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-[#74777e]">location_on</span>
                          <span>{p.location}</span>
                        </div>
                      </td>

                      {/* Nível Mínimo Crítico (Editable trigger) */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenAdjustment(p, 'min_stock')}
                          className="group inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f0f3ff] hover:bg-[#dee8ff] border border-[#c4c6ce]/40 font-mono text-xs font-bold text-[#001229] cursor-pointer"
                          title="Clique para editar o nível crítico mínimo de segurança deste item"
                        >
                          <span>{p.minStock} {p.stockUnit}</span>
                          <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 text-[#00687a]">
                            edit
                          </span>
                        </button>
                      </td>

                      {/* Saldo Atual & Visual Meter */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-bold font-mono text-[#001229]">
                              {p.stock}
                            </span>
                            <span className="text-xs text-[#74777e]">{p.stockUnit}</span>

                            {/* Status Badge */}
                            {p.isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ffdad6] text-[#93000a] animate-pulse">
                                Esgotado
                              </span>
                            ) : p.isCritical ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ffdad6] text-[#ba1a1a]">
                                Crítico
                              </span>
                            ) : p.stock <= p.minStock * 1.5 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                                Atenção
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Normal
                              </span>
                            )}
                          </div>

                          {/* Visual Stock Meter Bar */}
                          <div className="w-28 h-1.5 bg-[#dee8ff] rounded-full overflow-hidden mt-1.5">
                            <div
                              className={`h-full rounded-full transition-all ${
                                p.isOutOfStock
                                  ? 'bg-[#ba1a1a] w-0'
                                  : p.isCritical
                                  ? 'bg-[#ba1a1a]'
                                  : p.stock <= p.minStock * 1.5
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, percentOfMin))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Média de Venda & Cobertura */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-mono text-xs font-bold text-[#001229]">
                          ~{p.avgDailySales.toFixed(1)} <span className="font-normal text-[11px] text-[#74777e]">{p.stockUnit}/dia</span>
                        </div>
                        <div className="text-[11px] font-medium mt-0.5">
                          {p.isOutOfStock ? (
                            <span className="text-[#ba1a1a] font-bold">Ruptura (0 dias)</span>
                          ) : p.daysCoverage <= 3 ? (
                            <span className="text-[#ba1a1a] font-bold">
                              {p.daysCoverage.toFixed(1)} dias restantes!
                            </span>
                          ) : p.daysCoverage <= 7 ? (
                            <span className="text-amber-700 font-semibold">
                              {p.daysCoverage.toFixed(0)} dias de estoque
                            </span>
                          ) : (
                            <span className="text-[#74777e]">
                              {p.daysCoverage.toFixed(0)} dias de estoque
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sugestão de Compra Automática */}
                      <td className="py-3 px-3 text-center bg-amber-50/40 border-x border-amber-200/40">
                        {p.suggestedPurchaseQty > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-200 text-amber-950 border border-amber-300">
                              +{p.suggestedPurchaseQty} {p.stockUnit}
                            </span>
                            <span className="text-[10px] text-[#74777e] font-mono mt-0.5">
                              Custo est. R$ {(p.suggestedPurchaseQty * p.costPrice).toFixed(0)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-center gap-0.5">
                            <span className="material-symbols-outlined text-sm">check</span>
                            <span>Abastecido</span>
                          </span>
                        )}
                      </td>

                      {/* Manual Adjustment Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Quick Step -1 */}
                          <button
                            type="button"
                            onClick={() => handleQuickDelta(p, -1)}
                            disabled={p.stock <= 0}
                            className="w-7 h-7 rounded border border-[#c4c6ce]/60 hover:bg-[#ffdad6] text-[#ba1a1a] font-bold text-xs flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            title="Diminuir 1 unidade (-1)"
                          >
                            -1
                          </button>

                          {/* Quick Step +1 */}
                          <button
                            type="button"
                            onClick={() => handleQuickDelta(p, 1)}
                            className="w-7 h-7 rounded border border-[#c4c6ce]/60 hover:bg-[#e7eeff] text-[#00687a] font-bold text-xs flex items-center justify-center cursor-pointer"
                            title="Adicionar 1 unidade (+1)"
                          >
                            +1
                          </button>

                          {/* Quick Step +5 */}
                          <button
                            type="button"
                            onClick={() => handleQuickDelta(p, 5)}
                            className="px-1.5 h-7 rounded border border-[#c4c6ce]/60 hover:bg-[#e7eeff] text-[#00687a] font-bold text-[11px] flex items-center justify-center cursor-pointer"
                            title="Adicionar 5 unidades (+5)"
                          >
                            +5
                          </button>

                          {/* Full Adjustment Dialog Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustment(p, 'set')}
                            className="px-2.5 py-1 rounded bg-[#0f2744] hover:bg-[#00687a] text-white font-semibold text-[11px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Ajustar Saldo Físico / Motivo de Inventário"
                          >
                            <span className="material-symbols-outlined text-xs">tune</span>
                            <span>Ajustar</span>
                          </button>

                          {/* Sell in PDV button */}
                          {onNavigateToPDV && (
                            <button
                              type="button"
                              onClick={() => onNavigateToPDV(p)}
                              className="w-7 h-7 rounded bg-[#f0f3ff] hover:bg-[#dee8ff] text-[#00687a] border border-[#c4c6ce]/40 flex items-center justify-center cursor-pointer"
                              title="Bater item no PDV"
                            >
                              <span className="material-symbols-outlined text-sm">point_of_sale</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Summary Footer */}
        <div className="px-4 py-3 bg-[#f0f3ff]/40 border-t border-[#c4c6ce]/30 flex flex-col sm:flex-row items-center justify-between text-xs text-[#44474d] gap-2">
          <div>
            Exibindo <span className="font-bold text-[#001229]">{filteredProducts.length}</span> produtos ({stats.criticalCount} críticos requerem reposição).
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a]"></span>
              <span>Crítico (≤ Mínimo)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Atenção</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>Normal</span>
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MODAL 1: AJUSTE MANUAL DE ESTOQUE (INVENTÁRIO / BALANÇO)
      ========================================================================= */}
      {isAdjustmentModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#c4c6ce]/60 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#001229] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-amber-400 text-2xl">tune</span>
                <div>
                  <h3 className="font-bold text-base leading-tight">Ajuste Manual de Estoque</h3>
                  <p className="text-xs text-[#a6c8ff]">Lançamento de balanço físico e movimentação de inventário</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Product Reference Card */}
              <div className="p-3 rounded-xl bg-[#f0f3ff] border border-[#dee8ff] flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg shadow-inner flex items-center justify-center border border-black/10 shrink-0"
                  style={{ backgroundColor: selectedProduct.swatchHex }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#001229] text-sm truncate">{selectedProduct.name}</div>
                  <div className="flex items-center gap-2 text-xs text-[#44474d] mt-0.5">
                    <span className="font-mono font-bold text-[#00687a]">{selectedProduct.sku}</span>
                    <span>• {selectedProduct.brand}</span>
                    <span className="font-bold text-[#001229]">Saldo Atual: {selectedProduct.stock} {selectedProduct.stockUnit}</span>
                  </div>
                </div>
              </div>

              {/* Adjustment Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-[#001229] mb-1.5 uppercase tracking-wider">
                  Tipo de Movimentação / Ajuste:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => { setAdjustmentType('set'); setAdjustmentValue(String(selectedProduct.stock)); }}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                      adjustmentType === 'set'
                        ? 'bg-[#001229] text-white border-[#001229] shadow-xs'
                        : 'bg-white text-[#44474d] border-[#c4c6ce]/60 hover:bg-[#f0f3ff]'
                    }`}
                  >
                    📝 Novo Saldo Físico
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAdjustmentType('add'); setAdjustmentValue('1'); }}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                      adjustmentType === 'add'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-[#44474d] border-[#c4c6ce]/60 hover:bg-emerald-50'
                    }`}
                  >
                    ➕ Entrada (+)
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAdjustmentType('sub'); setAdjustmentValue('1'); }}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                      adjustmentType === 'sub'
                        ? 'bg-[#ba1a1a] text-white border-[#ba1a1a] shadow-xs'
                        : 'bg-white text-[#44474d] border-[#c4c6ce]/60 hover:bg-[#ffdad6]/40'
                    }`}
                  >
                    ➖ Baixa / Avaria (-)
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAdjustmentType('min_stock'); setAdjustmentValue(String(selectedProduct.minStock ?? 12)); }}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                      adjustmentType === 'min_stock'
                        ? 'bg-[#00687a] text-white border-[#00687a] shadow-xs'
                        : 'bg-white text-[#44474d] border-[#c4c6ce]/60 hover:bg-[#acedff]/30'
                    }`}
                  >
                    ⚙️ Nível Crítico Mínimo
                  </button>
                </div>
              </div>

              {/* Quantity Input & Differential Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-[#001229] mb-1">
                    {adjustmentType === 'set'
                      ? 'Novo Saldo Contado (Unidades):'
                      : adjustmentType === 'add'
                      ? 'Quantidade a Adicionar (+):'
                      : adjustmentType === 'sub'
                      ? 'Quantidade a Dar Baixa (-):'
                      : 'Novo Nível Crítico Mínimo:'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={adjustmentValue}
                      onChange={(e) => setAdjustmentValue(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border-2 border-[#00687a] font-mono text-lg font-bold text-[#001229] focus:outline-none focus:ring-2 focus:ring-[#00687a]/20"
                      autoFocus
                    />
                    <span className="absolute right-3 top-3 text-xs font-semibold text-[#74777e]">
                      {selectedProduct.stockUnit}
                    </span>
                  </div>
                </div>

                {/* Differential Projection Box */}
                <div className="p-3 rounded-lg bg-[#f0f3ff] border border-[#c4c6ce]/40 text-xs">
                  <div className="text-[#74777e] mb-1">Impacto no Saldo:</div>
                  {adjustmentType === 'min_stock' ? (
                    <div className="font-mono font-bold text-[#00687a]">
                      Limite mínimo de alerta alterado para {adjustmentValue || 0} {selectedProduct.stockUnit}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[#74777e]">{selectedProduct.stock}</span>
                      <span>➔</span>
                      <span className="font-bold text-base text-[#001229]">
                        {adjustmentType === 'set'
                          ? parseInt(adjustmentValue || '0', 10)
                          : adjustmentType === 'add'
                          ? selectedProduct.stock + parseInt(adjustmentValue || '0', 10)
                          : Math.max(0, selectedProduct.stock - parseInt(adjustmentValue || '0', 10))}
                      </span>
                      <span className="text-xs text-[#00687a] font-bold">
                        ({adjustmentType === 'set'
                          ? `${parseInt(adjustmentValue || '0', 10) - selectedProduct.stock >= 0 ? '+' : ''}${parseInt(adjustmentValue || '0', 10) - selectedProduct.stock}`
                          : adjustmentType === 'add'
                          ? `+${parseInt(adjustmentValue || '0', 10)}`
                          : `-${parseInt(adjustmentValue || '0', 10)}`})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reason Selector */}
              <div>
                <label className="block text-xs font-bold text-[#001229] mb-1">
                  Motivo da Movimentação:
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-lg border border-[#c4c6ce]/60 bg-white text-xs font-semibold text-[#001229] cursor-pointer"
                >
                  <option value="inventario">Contagem Física de Inventário / Balanço Geral</option>
                  <option value="avaria">Avaria no Estoque / Embalagem Rompida / Vazamento</option>
                  <option value="entrada_nf">Entrada Complementar de Mercadoria (Nota Fiscal)</option>
                  <option value="consumo_interno">Consumo Interno / Amostra de Cor Tintométrica</option>
                  <option value="ajuste_rapido">Correção de Registro / Ajuste Rápido de Balcão</option>
                </select>
              </div>

              {/* Note / Justification */}
              <div>
                <label className="block text-xs font-bold text-[#001229] mb-1">
                  Justificativa / Observação:
                </label>
                <input
                  type="text"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="Ex: Auditoria semanal de prateleira / Corredor A..."
                  className="w-full h-9 px-3 rounded-lg border border-[#c4c6ce]/60 text-xs focus:outline-none focus:ring-1 focus:ring-[#00687a]"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-[#f0f3ff]/80 border-t border-[#c4c6ce]/40 flex items-center justify-between">
              <span className="text-[11px] text-[#74777e]">
                Operador: <strong className="text-[#001229]">{currentUser.name}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#c4c6ce]/60 text-xs font-semibold text-[#44474d] hover:bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdjustment}
                  className="px-4 py-1.5 rounded-lg bg-[#00687a] hover:bg-[#004e5c] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Ajuste de Saldo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: SUGESTÃO AUTOMÁTICA DE PEDIDOS DE COMPRA
      ========================================================================= */}
      {isPurchaseOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#c4c6ce]/60 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-[#001229] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">shopping_cart_checkout</span>
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    Sugestão Automática de Pedidos de Compra
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#acedff] text-[#004e5c]">
                      Preditivo por Média de Vendas
                    </span>
                  </h3>
                  <p className="text-xs text-[#a6c8ff]">
                    Cálculo para {selectedCoverageDays} dias de cobertura de segurança contra ruptura
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPurchaseOrderModalOpen(false)}
                className="text-white/70 hover:text-white cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {/* Filter Bar inside Modal */}
            <div className="px-6 py-3 bg-[#f0f3ff]/70 border-b border-[#c4c6ce]/40 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#001229]">Filtrar por Fabricante:</span>
                <select
                  value={purchaseOrderFilterBrand}
                  onChange={(e) => setPurchaseOrderFilterBrand(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-[#c4c6ce]/60 bg-white font-semibold text-[#001229] cursor-pointer"
                >
                  <option value="todos">Todos os Fabricantes</option>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPurchaseOrderList(prev => prev.map(i => ({ ...i, selected: true })))}
                  className="text-xs text-[#00687a] hover:underline font-semibold cursor-pointer"
                >
                  Selecionar Todos
                </button>
                <span className="text-[#c4c6ce]">|</span>
                <button
                  type="button"
                  onClick={() => setPurchaseOrderList(prev => prev.map(i => ({ ...i, selected: false })))}
                  className="text-xs text-[#74777e] hover:underline font-semibold cursor-pointer"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-y-auto flex-1 p-6">
              {purchaseOrderList.filter(item => purchaseOrderFilterBrand === 'todos' || item.brand.toLowerCase() === purchaseOrderFilterBrand.toLowerCase()).length === 0 ? (
                <div className="py-12 text-center text-[#74777e]">
                  <p className="font-bold text-sm text-[#001229]">Nenhum produto precisando de compra neste fabricante</p>
                  <p className="text-xs mt-1">Todos os saldos estão dentro da margem de segurança de {selectedCoverageDays} dias.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#c4c6ce]/40 text-[11px] text-[#74777e] uppercase tracking-wider h-8">
                      <th className="py-2 px-2 text-center w-8">Incluir</th>
                      <th className="py-2 px-3 font-bold">Produto & SKU</th>
                      <th className="py-2 px-3 font-bold">Fabricante</th>
                      <th className="py-2 px-3 font-bold text-center">Saldo Atual vs Mín</th>
                      <th className="py-2 px-3 font-bold text-center">Média Diária</th>
                      <th className="py-2 px-3 font-bold text-center">Qtd Sugerida</th>
                      <th className="py-2 px-3 font-bold text-center">Qtd a Pedir</th>
                      <th className="py-2 px-3 font-bold text-right">Custo Est. Unit.</th>
                      <th className="py-2 px-3 font-bold text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c4c6ce]/20">
                    {purchaseOrderList
                      .filter(item => purchaseOrderFilterBrand === 'todos' || item.brand.toLowerCase() === purchaseOrderFilterBrand.toLowerCase())
                      .map((item) => {
                        const isChecked = item.selected;
                        const subtotal = item.orderQty * item.costPrice;

                        return (
                          <tr
                            key={item.productId}
                            className={`hover:bg-[#f0f3ff]/40 transition-colors ${!isChecked ? 'opacity-50 bg-gray-50' : ''}`}
                          >
                            <td className="py-2.5 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleOrderItem(item.productId)}
                                className="w-4 h-4 rounded text-[#00687a] cursor-pointer"
                              />
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[#001229]">{item.productName}</div>
                              <span className="font-mono text-[10px] text-[#74777e]">{item.sku}</span>
                            </td>

                            <td className="py-2.5 px-3 font-semibold text-[#001229]">
                              {item.brand}
                            </td>

                            <td className="py-2.5 px-3 text-center font-mono">
                              <span className={item.currentStock <= item.minStock ? 'text-[#ba1a1a] font-bold' : 'text-[#001229]'}>
                                {item.currentStock}
                              </span>
                              <span className="text-[#74777e]"> / {item.minStock} {item.stockUnit}</span>
                            </td>

                            <td className="py-2.5 px-3 text-center font-mono text-[#00687a] font-bold">
                              ~{item.avgDailySales.toFixed(1)}/dia
                            </td>

                            <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-700 bg-amber-50/50">
                              +{item.suggestedQty} {item.stockUnit}
                            </td>

                            {/* Editable Order Quantity */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min={0}
                                value={item.orderQty}
                                onChange={(e) => handleUpdateOrderQty(item.productId, parseInt(e.target.value || '0', 10))}
                                disabled={!isChecked}
                                className="w-16 h-8 text-center font-mono font-bold text-xs rounded border border-[#c4c6ce]/60 bg-white focus:outline-none focus:ring-1 focus:ring-[#00687a]"
                              />
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono text-[#44474d]">
                              R$ {item.costPrice.toFixed(2)}
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#001229]">
                              R$ {subtotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer with Totals and Order Execution Actions */}
            <div className="p-4 bg-[#f0f3ff] border-t border-[#c4c6ce]/40 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              {/* Order Totals */}
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] text-[#74777e] uppercase font-bold">Itens Selecionados</div>
                  <div className="font-mono font-bold text-base text-[#001229]">
                    {purchaseOrderList.filter(i => i.selected && i.orderQty > 0).length} produtos
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#74777e] uppercase font-bold">Volume Total a Comprar</div>
                  <div className="font-mono font-bold text-base text-[#00687a]">
                    {purchaseOrderList.filter(i => i.selected).reduce((acc, i) => acc + i.orderQty, 0)} unidades
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#74777e] uppercase font-bold">Valor Total Estimado</div>
                  <div className="font-mono font-bold text-lg text-[#001229]">
                    R$ {purchaseOrderList.filter(i => i.selected).reduce((acc, i) => acc + i.orderQty * i.costPrice, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `PEDIDO DE COMPRA - MARQUESCOLOR TINTAS\nData: ${new Date().toLocaleDateString('pt-BR')}\nItens:\n${purchaseOrderList.filter(i => i.selected && i.orderQty > 0).map(i => `- ${i.productName} (${i.sku}): ${i.orderQty} ${i.stockUnit} x R$ ${i.costPrice.toFixed(2)} = R$ ${(i.orderQty * i.costPrice).toFixed(2)}`).join('\n')}\nTOTAL: R$ ${purchaseOrderList.filter(i => i.selected).reduce((acc, i) => acc + i.orderQty * i.costPrice, 0).toFixed(2)}`;
                    navigator.clipboard?.writeText(text);
                    alert('Espelho do pedido de compra copiado para a área de transferência!');
                  }}
                  className="px-3 py-2 rounded-lg border border-[#c4c6ce]/60 bg-white hover:bg-[#dee8ff] text-xs font-semibold text-[#001229] cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span>Copiar Pedido</span>
                </button>

                <button
                  type="button"
                  onClick={handleFulfillPurchaseOrder}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">input</span>
                  <span>Efetivar Entrada no Estoque</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: HISTÓRICO DE AUDITORIA DE AJUSTES MANUAIS
      ========================================================================= */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#c4c6ce]/60 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-[#001229] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-xl text-[#57dffe]">history</span>
                <div>
                  <h3 className="font-bold text-base">Auditoria de Ajustes Manuais</h3>
                  <p className="text-xs text-[#a6c8ff]">Registro completo de contagens, baixas e entradas de estoque</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-2.5">
              {auditLog.length === 0 ? (
                <div className="py-8 text-center text-[#74777e]">Nenhum registro de ajuste manual gravado.</div>
              ) : (
                auditLog.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl border border-[#c4c6ce]/40 bg-[#f0f3ff]/40 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#001229] text-sm">{log.productName}</span>
                      <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                        log.delta > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.delta < 0
                          ? 'bg-[#ffdad6] text-[#93000a]'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta} un ({log.previousStock} ➔ {log.newStock})
                      </span>
                    </div>

                    <div className="text-[#44474d] mb-1.5">{log.reasonText}</div>

                    <div className="flex items-center justify-between text-[11px] text-[#74777e] pt-1.5 border-t border-[#c4c6ce]/30">
                      <span>SKU: <strong className="font-mono text-[#001229]">{log.sku}</strong> • {log.brand}</span>
                      <span>{log.timestamp} • Por <strong>{log.operator}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 bg-[#f0f3ff]/80 border-t border-[#c4c6ce]/40 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#001229] text-white text-xs font-bold cursor-pointer"
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
