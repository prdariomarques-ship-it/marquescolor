import React, { useState, useRef, useEffect } from 'react';
import { ProductItem, CartItem, Client, CompletedSaleData, SuspendedOrder } from '../types';

interface PDVViewProps {
  products: ProductItem[];
  clients: Client[];
  cart: CartItem[];
  onAddToCart: (product: ProductItem, quantity?: number) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onFinalizeSale: (summary: CompletedSaleData) => void;
  onOpenTintometria: () => void;
  savedOrders?: SuspendedOrder[];
  onSetSavedOrders?: React.Dispatch<React.SetStateAction<SuspendedOrder[]>>;
  onRestoreCart?: (items: CartItem[]) => void;
}

export const PDVView: React.FC<PDVViewProps> = ({
  products,
  clients,
  cart,
  onAddToCart,
  onUpdateQuantity,
  onRemoveFromCart,
  onClearCart,
  onFinalizeSale,
  onOpenTintometria,
  savedOrders,
  onSetSavedOrders,
  onRestoreCart,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [manualSkuInput, setManualSkuInput] = useState('');
  const [autoAddOnExact, setAutoAddOnExact] = useState(true);

  // Dedicated Price Check Mode
  const [isPriceCheckMode, setIsPriceCheckMode] = useState(false);
  const [priceCheckedProduct, setPriceCheckedProduct] = useState<ProductItem | null>(null);
  const [isPriceCheckModalOpen, setIsPriceCheckModalOpen] = useState(false);
  const isPriceCheckModeRef = useRef(isPriceCheckMode);

  useEffect(() => {
    isPriceCheckModeRef.current = isPriceCheckMode;
  }, [isPriceCheckMode]);

  // Suspended / Saved Orders Management
  const [internalSavedOrders, setInternalSavedOrders] = useState<SuspendedOrder[]>([]);
  const currentSavedOrders = savedOrders ?? internalSavedOrders;
  const setSavedOrdersState = onSetSavedOrders ?? setInternalSavedOrders;

  const [isSaveOrderModalOpen, setIsSaveOrderModalOpen] = useState(false);
  const [isViewSavedOrdersModalOpen, setIsViewSavedOrdersModalOpen] = useState(false);
  const [saveOrderNote, setSaveOrderNote] = useState('');

  // Hardware barcode scanner prefix configuration (defaults to '~' standard in POS scanners)
  const [scannerPrefix, setScannerPrefix] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_hardware_scanner_prefix') || '~';
    } catch {
      return '~';
    }
  });
  const [customPrefixInput, setCustomPrefixInput] = useState('');
  const [isScannerTransmitting, setIsScannerTransmitting] = useState(false);
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [lastScannedInfo, setLastScannedInfo] = useState<{
    code: string;
    productName: string;
    sku: string;
    time: string;
  } | null>(null);

  // References to accurately track rapid hardware keyboard strokes from scanner
  const isScanningRef = useRef(false);
  const scanBufferRef = useRef('');
  const scanTimeoutRef = useRef<number | null>(null);
  const scannerPrefixRef = useRef(scannerPrefix);

  useEffect(() => {
    scannerPrefixRef.current = scannerPrefix;
    try {
      localStorage.setItem('pos_hardware_scanner_prefix', scannerPrefix);
    } catch {
      // ignore
    }
  }, [scannerPrefix]);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    product?: ProductItem;
  } | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [selectedClientIndex, setSelectedClientIndex] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<'pix' | 'credito' | 'debito' | 'dinheiro' | 'faturado'>('pix');
  const [couponCode, setCouponCode] = useState('PINTOR5');
  const [couponApplied, setCouponApplied] = useState(true);
  const [receivedInput, setReceivedInput] = useState('1250');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const manualInputRef = useRef<HTMLInputElement>(null);
  const notificationTimeoutRef = useRef<number | null>(null);

  const client = clients[selectedClientIndex] || clients[0];

  // Calculate cart totals
  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const discountRate = couponApplied ? 0.05 : 0;
  const discountAmount = subtotal * discountRate;
  const totalToPay = Math.max(0, subtotal - discountAmount);

  const receivedAmount = parseFloat(receivedInput) || totalToPay;
  const changeAmount = Math.max(0, receivedAmount - totalToPay);
  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalWeightKg = (totalItemsCount * 7.6).toFixed(1);

  // Play pleasant cashier POS beep
  const playPOSBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext not available or allowed yet
    }
  };

  // Play pleasant price check consultation chime (higher 2-tone melodic chime)
  const playPriceCheckChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext not available or allowed yet
    }
  };

  // Open Price Check view for a product without adding to cart
  const handleOpenPriceCheck = (prod: ProductItem, queryCode?: string) => {
    setPriceCheckedProduct(prod);
    setIsPriceCheckModalOpen(true);
    playPriceCheckChime();
    setLastScannedInfo({
      code: queryCode || prod.barcode || prod.sku,
      productName: prod.name,
      sku: prod.sku,
      time: new Date().toLocaleTimeString('pt-BR'),
    });
    triggerNotification(
      `🔍 Consulta de Preço: ${prod.name} — R$ ${prod.price.toFixed(2)} (Estoque: ${prod.stock} un)`,
      'info',
      prod
    );
  };

  // Play pleasant order suspended chime
  const playSuspensionChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
        gain.gain.setValueAtTime(0.06, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.35);
      });
    } catch {
      // AudioContext not available
    }
  };

  // Handle Suspending / Saving current cart
  const handleSaveCurrentOrder = (noteText?: string) => {
    if (cart.length === 0) {
      triggerNotification('O carrinho está vazio. Adicione itens antes de suspender um pedido.', 'error');
      return;
    }

    const orderNum = `SUSP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newSuspended: SuspendedOrder = {
      id: `susp-${Date.now()}`,
      orderNumber: orderNum,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      client,
      items: [...cart],
      subtotal,
      discount: discountAmount,
      total: totalToPay,
      note: noteText?.trim() || saveOrderNote.trim() || 'Aguardando cliente',
      couponCode: couponApplied ? couponCode : undefined,
      couponApplied,
      selectedPayment,
    };

    setSavedOrdersState(prev => [newSuspended, ...prev]);

    // Clear active cart to free the cashier for the next customer
    if (onRestoreCart) {
      onRestoreCart([]);
    } else {
      onClearCart();
    }

    setIsSaveOrderModalOpen(false);
    setSaveOrderNote('');
    playSuspensionChime();
    triggerNotification(
      `✓ Pedido #${newSuspended.orderNumber} suspenso com sucesso! O caixa foi liberado para o próximo atendimento.`,
      'success'
    );
  };

  // Handle Restoring / Resuming a suspended order
  const handleRestoreSuspendedOrder = (order: SuspendedOrder, mode: 'replace' | 'merge' = 'replace') => {
    if (mode === 'replace') {
      if (onRestoreCart) {
        onRestoreCart(order.items);
      } else {
        onClearCart();
        order.items.forEach(it => onAddToCart(it.product, it.quantity));
      }
    } else {
      // Merge items
      if (onRestoreCart) {
        const merged = [...cart];
        order.items.forEach(it => {
          const ex = merged.find(m => m.product.id === it.product.id);
          if (ex) {
            ex.quantity += it.quantity;
          } else {
            merged.push(it);
          }
        });
        onRestoreCart(merged);
      } else {
        order.items.forEach(it => onAddToCart(it.product, it.quantity));
      }
    }

    // Restore client if present in clients list
    const clientIdx = clients.findIndex(c => c.id === order.client.id);
    if (clientIdx >= 0) {
      setSelectedClientIndex(clientIdx);
    }
    if (order.couponCode) {
      setCouponCode(order.couponCode);
      setCouponApplied(order.couponApplied ?? true);
    }
    if (order.selectedPayment) {
      setSelectedPayment(order.selectedPayment);
    }

    // Remove from savedOrders list
    setSavedOrdersState(prev => prev.filter(o => o.id !== order.id));
    setIsViewSavedOrdersModalOpen(false);
    playPOSBeep();
    triggerNotification(
      `✓ Pedido #${order.orderNumber} recuperado para o carrinho com sucesso!`,
      'success'
    );
  };

  // Handle Deleting a suspended order
  const handleDeleteSuspendedOrder = (orderId: string) => {
    setSavedOrdersState(prev => prev.filter(o => o.id !== orderId));
    triggerNotification('Pedido suspenso removido.', 'info');
  };

  // Helper to show temporary notification banner
  const triggerNotification = (
    message: string,
    type: 'success' | 'error' | 'info',
    product?: ProductItem
  ) => {
    if (notificationTimeoutRef.current) {
      window.clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ message, type, product });
    notificationTimeoutRef.current = window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Parse multiplier query e.g. "3*SUV-ACR-018" or "2x78912340058" or "SUV-ACR-018"
  const parseQueryAndQuantity = (raw: string) => {
    const trimmed = raw.trim();
    const multMatch = trimmed.match(/^(\d+)[\*xX\s]+(.+)$/);
    if (multMatch) {
      const qty = parseInt(multMatch[1], 10);
      const query = multMatch[2].trim();
      return { quantity: isNaN(qty) || qty <= 0 ? 1 : qty, query };
    }
    return { quantity: 1, query: trimmed };
  };

  // Search product within product list by SKU, Barcode, Alias, or Name
  const searchProductInList = (query: string, exactOnly: boolean = false): ProductItem | null => {
    if (!query) return null;
    const qLower = query.toLowerCase();

    // 1. Exact match on SKU
    const exactSku = products.find(p => p.sku.toLowerCase() === qLower);
    if (exactSku) return exactSku;

    // 2. Exact match on Barcode
    const exactBarcode = products.find(p => p.barcode && p.barcode.toLowerCase() === qLower);
    if (exactBarcode) return exactBarcode;

    // 3. Exact match on Alias codes
    const exactAlias = products.find(p => p.aliasCodes && p.aliasCodes.some(a => a.toLowerCase() === qLower));
    if (exactAlias) return exactAlias;

    if (exactOnly) return null;

    // 4. Prefix or partial match on SKU or Barcode
    const partialCode = products.find(p => 
      p.sku.toLowerCase().startsWith(qLower) || 
      (p.barcode && p.barcode.startsWith(qLower))
    );
    if (partialCode) return partialCode;

    // 5. General substring match in SKU, Barcode, or Product Name
    return products.find(p => 
      p.sku.toLowerCase().includes(qLower) ||
      (p.barcode && p.barcode.includes(qLower)) ||
      p.name.toLowerCase().includes(qLower)
    ) || null;
  };

  // Execute manual SKU / Barcode search and automatic cart addition
  const handleExecuteSkuSearchAndAdd = (rawInput: string, isAutoTrigger: boolean = false) => {
    if (!rawInput.trim()) return;

    const { quantity, query } = parseQueryAndQuantity(rawInput);
    if (!query) return;

    const found = searchProductInList(query, isAutoTrigger);

    if (found) {
      if (isPriceCheckMode) {
        handleOpenPriceCheck(found, query);
        setManualSkuInput('');
        setShowSuggestions(false);
        if (manualInputRef.current) {
          manualInputRef.current.focus();
        }
        return;
      }

      onAddToCart(found, quantity);
      playPOSBeep();
      triggerNotification(
        `✓ Produto adicionado automaticamente ao carrinho: ${found.name} (${found.sku}) ${quantity > 1 ? `[x${quantity}]` : ''}`,
        'success',
        found
      );
      setManualSkuInput('');
      setShowSuggestions(false);
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
    } else {
      if (!isAutoTrigger) {
        triggerNotification(
          `Código/SKU "${query}" não encontrado no cadastro de produtos.`,
          'error'
        );
      }
    }
  };

  // Live suggestions based on current manual input
  const liveParsed = parseQueryAndQuantity(manualSkuInput);
  const liveSuggestions = liveParsed.query.length >= 2
    ? products.filter(p => 
        p.sku.toLowerCase().includes(liveParsed.query.toLowerCase()) ||
        (p.barcode && p.barcode.includes(liveParsed.query.toLowerCase())) ||
        p.name.toLowerCase().includes(liveParsed.query.toLowerCase())
      ).slice(0, 4)
    : [];

  // Check for auto-add on exact match while typing (with debounce)
  useEffect(() => {
    if (!autoAddOnExact || !manualSkuInput.trim()) return;

    const { quantity, query } = parseQueryAndQuantity(manualSkuInput);
    if (query.length < 4) return;

    const timer = setTimeout(() => {
      const exactFound = searchProductInList(query, true);
      if (exactFound) {
        if (isPriceCheckMode) {
          handleOpenPriceCheck(exactFound, query);
          setManualSkuInput('');
          setShowSuggestions(false);
          return;
        }

        onAddToCart(exactFound, quantity);
        playPOSBeep();
        triggerNotification(
          `✓ Adicionado automaticamente via detecção de código exato: ${exactFound.name} (${exactFound.sku}) ${quantity > 1 ? `[x${quantity}]` : ''}`,
          'success',
          exactFound
        );
        setManualSkuInput('');
        setShowSuggestions(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [manualSkuInput, autoAddOnExact, products, isPriceCheckMode]);

  // Process scanned code detected by the hardware listener and trigger onAddToCart immediately
  const handleHardwareScanDetected = (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    // Support encoded quantity prefix if scanner transmits multiplier, e.g. "3*78912340058" or "78912340058"
    const { quantity, query } = parseQueryAndQuantity(trimmed);
    const targetCode = query || trimmed;
    const qLower = targetCode.toLowerCase();

    // Exact search in catalog by barcode, SKU, alias codes, or exact name
    const foundProduct = products.find(p => 
      (p.barcode && p.barcode.toLowerCase() === qLower) ||
      p.sku.toLowerCase() === qLower ||
      (p.aliasCodes && p.aliasCodes.some(a => a.toLowerCase() === qLower))
    ) || products.find(p => p.name.toLowerCase() === qLower);

    if (foundProduct) {
      if (isPriceCheckModeRef.current) {
        // Price Check Mode: display product details and price without adding to cart
        handleOpenPriceCheck(foundProduct, targetCode);
        return;
      }

      // Normal Sale Mode: trigger 'onAddToCart' immediately upon detection
      onAddToCart(foundProduct, quantity);
      playPOSBeep();
      triggerNotification(
        `⚡ Leitor Óptico Hardware [${scannerPrefixRef.current}]: ${foundProduct.name} (${foundProduct.sku}) x${quantity} adicionado com sucesso!`,
        'success',
        foundProduct
      );
      setLastScannedInfo({
        code: targetCode,
        productName: foundProduct.name,
        sku: foundProduct.sku,
        time: new Date().toLocaleTimeString('pt-BR'),
      });
    } else {
      triggerNotification(
        `⚠ Leitor Óptico Hardware [${scannerPrefixRef.current}]: Código "${targetCode}" não foi localizado no cadastro de produtos.`,
        'error'
      );
    }
  };

  // Helper to simulate hardware scan transmission for testing/demonstration
  const handleSimulateHardwareScan = (barcode: string) => {
    setIsScannerTransmitting(true);
    setTimeout(() => {
      handleHardwareScanDetected(barcode);
      setIsScannerTransmitting(false);
    }, 120);
  };

  // Global keyboard event listener specifically for barcode scanner hardware that prefixes data with a specific character
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activePrefix = scannerPrefixRef.current;
      if (!activePrefix) return;

      // Detect prefix character that starts a barcode transmission from hardware scanner
      if (!isScanningRef.current && e.key === activePrefix) {
        // Barcode scanner transmission detected!
        isScanningRef.current = true;
        scanBufferRef.current = '';
        setIsScannerTransmitting(true);
        e.preventDefault();
        e.stopPropagation();

        // Safety fallback timer: auto-process if scanner finishes transmission without sending Enter
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = window.setTimeout(() => {
          if (isScanningRef.current) {
            const buffered = scanBufferRef.current;
            isScanningRef.current = false;
            scanBufferRef.current = '';
            setIsScannerTransmitting(false);
            if (buffered.length >= 1) {
              handleHardwareScanDetected(buffered);
            }
          }
        }, 250);
        return;
      }

      // If we are currently capturing hardware scanner stream
      if (isScanningRef.current) {
        // Barcode terminator: standard hardware scanners send Enter at end of scan
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

          const finalBuffer = scanBufferRef.current;
          isScanningRef.current = false;
          scanBufferRef.current = '';
          setIsScannerTransmitting(false);

          if (finalBuffer.length >= 1) {
            handleHardwareScanDetected(finalBuffer);
          }
          return;
        }

        // Cancel on Escape
        if (e.key === 'Escape') {
          isScanningRef.current = false;
          scanBufferRef.current = '';
          setIsScannerTransmitting(false);
          if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
          return;
        }

        // Capture printable character stream emitted by the scanner hardware
        if (e.key.length === 1) {
          e.preventDefault();
          e.stopPropagation();
          scanBufferRef.current += e.key;

          // Reset safety timeout on each new character received
          if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = window.setTimeout(() => {
            if (isScanningRef.current) {
              const buffered = scanBufferRef.current;
              isScanningRef.current = false;
              scanBufferRef.current = '';
              setIsScannerTransmitting(false);
              if (buffered.length >= 1) {
                handleHardwareScanDetected(buffered);
              }
            }
          }, 250);
        }
      }
    };

    // Use capture phase (useCapture: true) to intercept hardware scanner keys before any focused input element
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, [products, onAddToCart]);

  // Focus input on hotkey F2, toggle Price Check on F3, and close modal on Escape
  useEffect(() => {
    const handleHotkeys = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        manualInputRef.current?.focus();
        manualInputRef.current?.select();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setIsPriceCheckMode(prev => {
          const next = !prev;
          if (next) {
            playPriceCheckChime();
            triggerNotification(
              '🔍 MODO CONSULTA DE PREÇO ATIVADO (F3): Escaneamentos e consultas exibirão preço e estoque sem incluir no carrinho.',
              'info'
            );
          } else {
            playPOSBeep();
            triggerNotification(
              '🛒 MODO VENDA NORMAL ATIVADO: Escaneamento voltará a adicionar ao carrinho.',
              'success'
            );
          }
          return next;
        });
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (cart.length > 0) {
          setIsSaveOrderModalOpen(true);
        } else if (currentSavedOrders.length > 0) {
          setIsViewSavedOrdersModalOpen(true);
        } else {
          triggerNotification('O carrinho está vazio. Adicione itens antes de salvar/suspender um pedido.', 'info');
        }
      } else if (e.key === 'Escape') {
        if (isPriceCheckModalOpen) setIsPriceCheckModalOpen(false);
        if (isSaveOrderModalOpen) setIsSaveOrderModalOpen(false);
        if (isViewSavedOrdersModalOpen) setIsViewSavedOrdersModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [isPriceCheckModalOpen, isSaveOrderModalOpen, isViewSavedOrdersModalOpen, cart.length, currentSavedOrders.length]);

  // Form submit handler for the Manual SKU/Barcode input
  const handleManualInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecuteSkuSearchAndAdd(manualSkuInput, false);
  };

  // Keypad click handler
  const handleKeypadPress = (val: string) => {
    if (val === 'backspace') {
      setReceivedInput(prev => prev.slice(0, -1) || '0');
    } else if (val === '00') {
      setReceivedInput(prev => prev === '0' ? '0' : prev + '00');
    } else {
      setReceivedInput(prev => prev === '0' ? val : prev + val);
    }
  };

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'todas') return true;
    return p.category === selectedCategory;
  });

  const handleCheckout = () => {
    onFinalizeSale({
      total: totalToPay,
      paymentMethod: selectedPayment.toUpperCase(),
      receivedAmount,
      changeAmount,
      client,
      items: [...cart],
      subtotal,
      discount: discountAmount,
      couponCode: couponApplied ? couponCode : undefined,
      timestamp: new Date().toLocaleString('pt-BR'),
    });
  };

  // Sample quick chips for instant testing of manual SKU/Barcode entry
  const sampleCodes = [
    { label: 'PPG-PU-090', desc: 'Preto Ninja PU', code: 'PPG-PU-090' },
    { label: 'LAX-VRN-090', desc: 'Verniz PU HS', code: 'LAX-VRN-090' },
    { label: 'MAX-MAS-010', desc: 'Massa Poliéster', code: 'MAX-MAS-010' },
    { label: 'MAX-PRI-090', desc: 'Primer PU 4:1', code: 'MAX-PRI-090' },
    { label: '3M-MAS-024', desc: 'Fita 3M Verde', code: '3M-MAS-024' },
    { label: 'SUV-ACR-018', desc: 'Látex 18L', code: 'SUV-ACR-018' },
    { label: '78912340058', desc: 'EAN Barra', code: '78912340058' },
    { label: 'COR-ESM-036', desc: 'Coralit 3.6L', code: 'COR-ESM-036' },
  ];

  return (
    <div className="h-[calc(100vh-6rem)] grid grid-cols-12 gap-3 overflow-hidden select-none">
      {/* =========================================================================
          COLUNA 1 (ESQUERDA - 4 COLUNAS): CATÁLOGO, BUSCA ÓTICA & PRODUTOS FREQUENTES
          ========================================================================= */}
      <section className="col-span-12 xl:col-span-4 flex flex-col h-full bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden">
        {/* Top Scanner & Manual SKU / Barcode Entry Header */}
        <div className="p-3 border-b border-[#c4c6ce]/30 bg-[#f0f3ff]/70 relative">
          {/* Notification Toast Banner */}
          {notification && (
            <div
              className={`mb-2.5 p-2 rounded-lg text-xs font-semibold flex items-center justify-between shadow-xs transition-all duration-200 animate-in fade-in slide-in-from-top-1 ${
                notification.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : notification.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-300'
                  : 'bg-sky-50 text-sky-900 border border-sky-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">
                  {notification.type === 'success'
                    ? 'check_circle'
                    : notification.type === 'error'
                    ? 'error'
                    : 'info'}
                </span>
                <span>{notification.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer ml-2"
                title="Fechar notificação"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {/* Operating Mode Switch: Sale Mode vs Dedicated Price Check Mode */}
          <div className="mb-2.5 flex items-center rounded-lg bg-white p-1 border border-[#c4c6ce]/60 shadow-2xs">
            <button
              type="button"
              onClick={() => setIsPriceCheckMode(false)}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                !isPriceCheckMode
                  ? 'bg-[#001229] text-white shadow-xs'
                  : 'text-[#44474d] hover:bg-[#f0f3ff]'
              }`}
            >
              <span className="material-symbols-outlined text-base">shopping_cart</span>
              <span>Modo Venda</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPriceCheckMode(true)}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isPriceCheckMode
                  ? 'bg-gradient-to-r from-indigo-800 to-indigo-950 text-white shadow-xs ring-1 ring-amber-400'
                  : 'text-indigo-900 hover:bg-indigo-50'
              }`}
            >
              <span className="material-symbols-outlined text-base text-amber-300">price_check</span>
              <span>Consulta de Preço</span>
              <kbd className="px-1.5 py-0.2 rounded bg-amber-400 text-indigo-950 text-[10px] font-mono font-bold">
                F3
              </kbd>
            </button>
          </div>

          {/* Price Check Mode Banner (when active) */}
          {isPriceCheckMode && (
            <div className="mb-2.5 p-2.5 rounded-lg bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-800 text-white border-2 border-indigo-400 shadow-md flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-300 text-xl">search_insights</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-300 font-mono">
                      MODO CONSULTA DE PREÇO ATIVO
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-400 text-indigo-950 text-[10px] font-mono font-bold">
                      F3
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-200">
                    O leitor óptico e a busca manual exibirão a ficha de preço e estoque sem alterar o carrinho.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPriceCheckMode(false)}
                className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold rounded-md border border-white/30 cursor-pointer shrink-0 ml-2"
              >
                Voltar p/ Venda
              </button>
            </div>
          )}

          {/* Hardware Barcode Scanner Status Bar & Global Listener Active */}
          <div
            className={`mb-2.5 p-2 rounded-lg border transition-all ${
              isScannerTransmitting
                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300 animate-pulse'
                : isPriceCheckMode
                ? 'bg-indigo-50 border-indigo-300'
                : 'bg-[#e7eeff] border-[#00687a]/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[#001229]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPriceCheckMode ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPriceCheckMode ? 'bg-amber-500' : 'bg-emerald-600'}`}></span>
                </span>
                <span className={`material-symbols-outlined text-sm ${isPriceCheckMode ? 'text-indigo-700' : 'text-[#00687a]'}`}>
                  {isPriceCheckMode ? 'price_check' : 'barcode_reader'}
                </span>
                <span className="text-[11px]">Leitor Físico:</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  isPriceCheckMode
                    ? 'bg-indigo-900 text-amber-300 border border-amber-400/40'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isPriceCheckMode ? 'MODO CONSULTA [F3]' : 'ATIVO'}
                </span>
                <span
                  className="text-[10px] text-[#004e5c] font-mono bg-white px-1.5 py-0.2 rounded border border-[#c4c6ce]/60 font-bold"
                  title={`Prefixo configurado no leitor: ${scannerPrefix}`}
                >
                  Prefixo: &quot;{scannerPrefix}&quot;
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowScannerSettings(!showScannerSettings)}
                className="text-[10px] font-bold text-[#00687a] hover:text-[#001229] bg-white hover:bg-white/80 border border-[#c4c6ce]/60 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Configurações e simulação do leitor de hardware"
              >
                <span className="material-symbols-outlined text-xs">tune</span>
                <span>{showScannerSettings ? 'Fechar' : 'Configurar / Testar'}</span>
              </button>
            </div>

            {/* Active Transmission Glow Notice */}
            {isScannerTransmitting && (
              <div className="mt-1.5 text-[11px] font-bold text-amber-900 flex items-center gap-1 animate-pulse">
                <span className="material-symbols-outlined text-sm">bolt</span>
                <span>Transmitindo feixe do leitor óptico... {isPriceCheckMode ? 'Consultando preço...' : 'Interceptando código...'}</span>
              </div>
            )}

            {/* Last Scanned info row (if exists and settings not open) */}
            {lastScannedInfo && !showScannerSettings && (
              <div className="mt-1 text-[10px] text-[#44474d] flex items-center justify-between">
                <span className="truncate">
                  Último scan via leitor: <strong className="font-mono text-[#001229]">{lastScannedInfo.code}</strong> ({lastScannedInfo.productName})
                </span>
                <span className="text-[9px] font-mono text-[#74777e] shrink-0 ml-1">{lastScannedInfo.time}</span>
              </div>
            )}

            {/* Expanded Hardware Scanner Configuration & Test Simulator */}
            {showScannerSettings && (
              <div className="mt-2 pt-2 border-t border-[#00687a]/20 text-xs">
                <p className="text-[10px] text-[#44474d] mb-1.5 leading-snug">
                  O listener global de teclado monitora o leitor óptico físico (USB/Bluetooth HID). Ao detectar o prefixo &quot;<strong>{scannerPrefix}</strong>&quot;, {isPriceCheckMode ? 'o produto é exibido na tela de consulta de preço sem alterar o carrinho.' : 'os dados são interceptados e o produto é adicionado imediatamente ao carrinho (onAddToCart).'}
                </p>

                {/* Prefix selector */}
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold text-[#001229]">Alterar Prefixo:</span>
                  {['~', ';', '@', '$', '%'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setScannerPrefix(p)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-all ${
                        scannerPrefix === p
                          ? 'bg-[#00687a] text-white shadow-2xs'
                          : 'bg-white text-[#44474d] border border-[#c4c6ce]/60 hover:bg-[#e7eeff]'
                      }`}
                    >
                      {p} {p === '~' && '(Padrão)'}
                    </button>
                  ))}
                  {/* Custom prefix input */}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      maxLength={1}
                      value={customPrefixInput}
                      onChange={(e) => setCustomPrefixInput(e.target.value)}
                      placeholder="Outro"
                      className="w-12 h-5 text-center text-[10px] font-mono border border-[#c4c6ce] rounded bg-white"
                    />
                    {customPrefixInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setScannerPrefix(customPrefixInput);
                          setCustomPrefixInput('');
                        }}
                        className="px-1.5 py-0.5 bg-[#001229] text-white rounded text-[9px] font-bold cursor-pointer"
                      >
                        OK
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulator buttons for testing without hardware */}
                <div className="p-1.5 bg-white/80 rounded border border-[#c4c6ce]/60">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#00687a] mb-1">
                    <span>
                      {isPriceCheckMode
                        ? '⚡ Simular Consulta Óptica (sem adicionar ao carrinho):'
                        : `⚡ Simular Feixe do Leitor (com prefixo "${scannerPrefix}"):`}
                    </span>
                    <span className="text-[9px] text-[#74777e] font-normal">
                      {isPriceCheckMode ? 'Abre ficha de preço' : 'Dispara onAddToCart direto'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: 'EAN: 78912340058', code: '78912340058' },
                      { label: 'PU: PPG-PU-090', code: 'PPG-PU-090' },
                      { label: 'Verniz: LAX-VRN-090', code: 'LAX-VRN-090' },
                      { label: 'Massa: MAX-MAS-010', code: 'MAX-MAS-010' },
                      { label: 'Fita 3M: 3M-MAS-024', code: '3M-MAS-024' },
                    ].map(s => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => handleSimulateHardwareScan(s.code)}
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium transition-all cursor-pointer flex items-center gap-0.5 shadow-2xs ${
                          isPriceCheckMode
                            ? 'bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 border-indigo-200 text-indigo-950'
                            : 'bg-white hover:bg-emerald-50 hover:border-emerald-500 border-[#c4c6ce]/80 text-[#001229]'
                        }`}
                      >
                        <span className={isPriceCheckMode ? 'text-indigo-700 font-bold' : 'text-emerald-700 font-bold'}>
                          {scannerPrefix}
                        </span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section Header with Status and Controls */}
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="manual-sku-input"
              className="text-xs font-bold text-[#001229] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base text-[#00687a]">barcode_scanner</span>
              <span>Entrada Manual de SKU / Código de Barras</span>
              <kbd className="px-1.5 py-0.2 rounded bg-white text-[#00687a] border border-[#c4c6ce]/60 text-[10px] font-mono shadow-2xs font-bold">
                F2
              </kbd>
            </label>

            {/* Auto-Add on Exact Match Toggle */}
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-[11px] font-medium text-[#44474d] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAddOnExact}
                  onChange={(e) => setAutoAddOnExact(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-[#00687a] focus:ring-[#00687a] cursor-pointer"
                />
                <span className="hidden sm:inline">Adição Automática</span>
              </label>
              <span
                className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  autoAddOnExact
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {autoAddOnExact ? 'Auto-Add ON' : 'Manual'}
              </span>
            </div>
          </div>

          {/* Manual SKU / Barcode Entry Form */}
          <form onSubmit={handleManualInputSubmit} className="relative">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[#00687a] text-lg pointer-events-none">
                search
              </span>
              <input
                id="manual-sku-input"
                ref={manualInputRef}
                type="text"
                value={manualSkuInput}
                onChange={(e) => {
                  setManualSkuInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={
                  isPriceCheckMode
                    ? "Consultar Preço: digite SKU ou Código de Barras (ex: SUV-ACR-018 ou 78912340058)..."
                    : "Digitar SKU ou Código de Barras (ex: SUV-ACR-018 ou 78912340058)..."
                }
                autoComplete="off"
                className={`w-full h-11 pl-10 pr-28 rounded-lg bg-white border-2 text-xs font-mono font-semibold text-[#001229] shadow-inner placeholder:font-sans placeholder:text-[#74777e] transition-colors ${
                  isPriceCheckMode
                    ? 'border-indigo-600 focus:border-indigo-700 focus:ring-2 focus:ring-indigo-300'
                    : 'border-[#00687a] focus:border-[#00687a] focus:ring-2 focus:ring-[#00687a]/20'
                }`}
              />

              {/* Clear button if input is filled */}
              {manualSkuInput && (
                <button
                  type="button"
                  onClick={() => {
                    setManualSkuInput('');
                    setShowSuggestions(false);
                    manualInputRef.current?.focus();
                  }}
                  className="absolute right-24 p-1 text-[#74777e] hover:text-[#001229] cursor-pointer"
                  title="Limpar"
                >
                  <span className="material-symbols-outlined text-sm">cancel</span>
                </button>
              )}

              {/* Submit / Action button */}
              <button
                type="submit"
                className={`absolute right-1 px-3 py-1.5 active:scale-95 text-white font-mono text-xs rounded-md shadow-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  isPriceCheckMode
                    ? 'bg-indigo-800 hover:bg-indigo-900'
                    : 'bg-[#001229] hover:bg-[#00244d]'
                }`}
                title={isPriceCheckMode ? "Consultar preço e detalhes do produto" : "Buscar no catálogo e adicionar ao carrinho"}
              >
                <span className="material-symbols-outlined text-sm">
                  {isPriceCheckMode ? 'price_check' : 'search'}
                </span>
                <span>{isPriceCheckMode ? 'Consultar' : 'Adicionar'}</span>
                <span className="text-[10px] opacity-70">↵</span>
              </button>
            </div>

            {/* Real-time Match Suggestions Dropdown */}
            {showSuggestions && manualSkuInput.trim().length >= 2 && liveSuggestions.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white rounded-lg border border-[#c4c6ce] shadow-xl overflow-hidden">
                <div className="p-1.5 bg-[#e7eeff] border-b border-[#c4c6ce]/30 flex items-center justify-between text-[11px] text-[#44474d] font-semibold">
                  <span>Resultados correspondentes no catálogo ({liveSuggestions.length}):</span>
                  <span className="text-[10px] text-[#00687a]">
                    {isPriceCheckMode ? 'Clique para consultar preço' : 'Clique para adicionar direto'}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-[#c4c6ce]/20">
                  {liveSuggestions.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        if (isPriceCheckMode) {
                          handleOpenPriceCheck(prod, prod.sku);
                          setManualSkuInput('');
                          setShowSuggestions(false);
                          manualInputRef.current?.focus();
                          return;
                        }

                        const { quantity } = parseQueryAndQuantity(manualSkuInput);
                        onAddToCart(prod, quantity);
                        playPOSBeep();
                        triggerNotification(
                          `✓ Produto adicionado ao carrinho: ${prod.name} (${prod.sku})`,
                          'success',
                          prod
                        );
                        setManualSkuInput('');
                        setShowSuggestions(false);
                        manualInputRef.current?.focus();
                      }}
                      className="w-full p-2 text-left hover:bg-[#f0f3ff] transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center border border-black/10 shrink-0"
                          style={{ backgroundColor: prod.swatchHex }}
                        >
                          {prod.swatchDot && (
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: prod.swatchDot }}
                            />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-[#001229] truncate">{prod.name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#74777e]">
                            <span className="bg-[#e7eeff] px-1 py-0.2 rounded text-[#001229] font-bold">
                              SKU: {prod.sku}
                            </span>
                            {prod.barcode && (
                              <span className="bg-[#f0f3ff] px-1 py-0.2 rounded">
                                EAN: {prod.barcode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <span className="text-xs font-mono font-bold text-[#00687a]">
                            R$ {prod.price.toFixed(2)}
                          </span>
                          <span className="block text-[10px] text-emerald-700 font-medium">
                            Estoque: {prod.stock}
                          </span>
                        </div>
                        <span className="material-symbols-outlined text-sm text-[#00687a] opacity-0 group-hover:opacity-100 transition-opacity">
                          {isPriceCheckMode ? 'price_check' : 'add_shopping_cart'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* Quick SKU & Barcode Click-to-Test Pills */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto text-[11px] pb-0.5">
            <span className="text-[10px] font-bold text-[#74777e] uppercase shrink-0">
              {isPriceCheckMode ? 'Consultar SKU/Cód:' : 'Testar SKU/Cód:'}
            </span>
            {sampleCodes.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setManualSkuInput(item.code);
                  handleExecuteSkuSearchAndAdd(item.code, false);
                }}
                className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold transition-all shrink-0 cursor-pointer shadow-2xs flex items-center gap-1 ${
                  isPriceCheckMode
                    ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 text-indigo-950'
                    : 'bg-white border-[#c4c6ce]/60 hover:border-[#00687a] hover:bg-[#e7eeff] text-[#001229]'
                }`}
                title={isPriceCheckMode ? `Consultar preço de ${item.desc}` : `Clique para testar busca e adição automática: ${item.desc}`}
              >
                <span>{item.label}</span>
                <span className="text-[9px] text-[#74777e]">({item.desc})</span>
              </button>
            ))}
          </div>

          {/* Multiplier Hint Microcopy */}
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#74777e]">
            <span>
              {isPriceCheckMode
                ? '💡 Modo Consulta: escaneie ou digite para abrir a ficha de preço e estoque sem alterar o carrinho.'
                : '💡 Digite o SKU ou Barcode. Dica: use 3*SKU para quantidade.'}
            </span>
            <span className="font-mono text-[#00687a] font-semibold">
              {isPriceCheckMode ? 'Enter = Consultar Preço' : 'Enter = Adicionar'}
            </span>
          </div>
        </div>

        {/* Category Filter Tabs with Color Badges */}
        <div className="p-2 border-b border-[#c4c6ce]/30 bg-white">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedCategory('todas')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'todas'
                  ? 'bg-[#001229] text-white shadow-xs'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#57dffe]"></span>
              Todas
            </button>

            <button
              onClick={() => setSelectedCategory('automotiva')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'automotiva'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-600"></span>
              Tintas Automotivas
            </button>

            <button
              onClick={() => setSelectedCategory('complementos')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'complementos'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              Complementos & Funilaria
            </button>

            <button
              onClick={() => setSelectedCategory('imobiliaria')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'imobiliaria'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              Tintas Imobiliárias
            </button>

            <button
              onClick={() => setSelectedCategory('metais')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'metais'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Esmaltes & Metais
            </button>

            <button
              onClick={() => setSelectedCategory('vernizes')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'vernizes'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              Vernizes
            </button>

            <button
              onClick={() => setSelectedCategory('acessorios')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'acessorios'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Acessórios
            </button>

            <button
              onClick={() => setSelectedCategory('preparacao')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'preparacao'
                  ? 'bg-[#001229] text-white font-bold'
                  : 'bg-[#f0f3ff] text-[#44474d] hover:bg-[#dee8ff]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Massas & Solventes
            </button>
          </div>
        </div>

        {/* High-Velocity Frequent Product Catalog Grid */}
        <div className="flex-1 p-2.5 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] text-[#74777e] font-bold uppercase tracking-wider">
              Itens Rápidos de Balcão ({filteredProducts.length} itens)
            </span>
            <span className="text-[11px] text-[#00687a] font-semibold">
              Atualização em tempo real
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map((prod) => (
              <div
                key={prod.id}
                onClick={() => onAddToCart(prod)}
                className="group p-2.5 bg-white rounded-xl border border-[#c4c6ce]/50 hover:border-[#00687a] hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col justify-between active:scale-[0.98]"
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-2">
                      {/* Swatch / Paint Pill */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shadow-inner border border-black/10 shrink-0"
                        style={{ backgroundColor: prod.swatchHex }}
                      >
                        {prod.swatchDot && (
                          <span
                            className="w-3.5 h-3.5 rounded-full shadow-xs"
                            style={{ backgroundColor: prod.swatchDot }}
                          />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e7eeff] text-[#001229]">
                            {prod.finish}
                          </span>
                          {prod.category === 'automotiva' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-800">
                              Auto
                            </span>
                          )}
                          {prod.category === 'complementos' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-100 text-orange-800">
                              Compl.
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-[#74777e] font-mono">
                          SKU: {prod.sku}
                        </span>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Estq: {prod.stock}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-[#001229] line-clamp-2 leading-tight">
                    {prod.name}
                  </h3>
                </div>

                <div className="mt-2 pt-2 border-t border-[#c4c6ce]/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#74777e] block">Preço Balcão</span>
                    <span className="text-xs font-mono font-bold text-[#001229]">
                      R$ {prod.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToCart(prod);
                    }}
                    className="w-7 h-7 rounded-lg bg-[#0f2744] text-white flex items-center justify-center group-hover:bg-[#00687a] transition-colors shadow-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Action Footbar */}
        <div className="p-2 border-t border-[#c4c6ce]/30 bg-[#f0f3ff] flex items-center justify-between text-xs text-[#74777e]">
          <button 
            onClick={onOpenTintometria} 
            className="flex items-center gap-1 hover:text-[#00687a] cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-[#00687a]">colorize</span>
            <span>Toque para dosar fórmula tintométrica</span>
          </button>
          <span className="font-mono font-bold text-[#001229]">[F5] Consulta Rápida</span>
        </div>
      </section>

      {/* =========================================================================
          COLUNA 2 (CENTRO - 5 COLUNAS): CUPOM / CARRINHO DE COMPRAS DO CAIXA
          ========================================================================= */}
      <section className="col-span-12 xl:col-span-5 flex flex-col h-full bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden">
        {/* Cart Header: Venda ID & Cliente Vinculado */}
        <div className="p-3 bg-[#f0f3ff] border-b border-[#c4c6ce]/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 bg-[#001229] text-white rounded-lg font-mono font-bold text-xs tracking-wide flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#57dffe]">receipt</span>
              VENDA #4892
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#001229]">{client.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#57dffe]/30 text-[#004e5c]">
                  10% Convênio
                </span>
              </div>
              <p className="text-[11px] text-[#74777e]">
                {client.docType}: {client.doc} • {client.segment}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <select
              value={selectedClientIndex}
              onChange={(e) => setSelectedClientIndex(Number(e.target.value))}
              className="text-xs py-1 px-2 rounded-lg bg-white border border-[#c4c6ce]/50 text-[#001229] cursor-pointer"
              title="Alternar Cliente do Caixa"
            >
              {clients.map((c, idx) => (
                <option key={c.id} value={idx}>
                  {c.name.split(' ')[0]} ({c.segment})
                </option>
              ))}
            </select>

            {/* Salvar Pedido [F6] */}
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  triggerNotification('O carrinho está vazio. Adicione itens antes de salvar/suspender.', 'info');
                  return;
                }
                setIsSaveOrderModalOpen(true);
              }}
              disabled={cart.length === 0}
              className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              title="Suspender venda e liberar caixa [F6]"
            >
              <span className="material-symbols-outlined text-sm text-indigo-700">bookmark_add</span>
              <span>[F6] Salvar</span>
            </button>

            {/* Ver Pedidos Salvos */}
            <button
              type="button"
              onClick={() => setIsViewSavedOrdersModalOpen(true)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                currentSavedOrders.length > 0
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 ring-1 ring-amber-300'
                  : 'bg-white hover:bg-[#f0f3ff] text-[#44474d] border border-[#c4c6ce]/40'
              }`}
              title="Ver e recuperar pedidos suspensos"
            >
              <span className="material-symbols-outlined text-sm text-amber-700">history_toggle_off</span>
              <span>Salvos</span>
              {currentSavedOrders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-mono font-black">
                  {currentSavedOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={onClearCart}
              className="px-2 py-1.5 rounded-lg bg-white hover:bg-[#ffdad6] text-[#ba1a1a] border border-[#c4c6ce]/40 transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title="Cancelar Venda [F8]"
            >
              <span className="material-symbols-outlined text-sm">delete_sweep</span>
              <span>[F8] Excluir</span>
            </button>
          </div>
        </div>

        {/* Suspended Orders Banner Ribbon */}
        {currentSavedOrders.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-between text-xs text-amber-900 animate-in fade-in">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="material-symbols-outlined text-amber-700 text-base">pause_circle</span>
              <span>
                Há <strong>{currentSavedOrders.length} pedido(s) suspenso(s)</strong> aguardando retomada no caixa.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsViewSavedOrdersModalOpen(true)}
              className="text-amber-950 hover:underline font-bold text-[11px] cursor-pointer"
            >
              Ver e Recuperar &rarr;
            </button>
          </div>
        )}

        {/* Cart Item Stream Table */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#74777e] p-6 text-center">
              <span className="material-symbols-outlined text-4xl mb-2 text-[#c4c6ce]">shopping_cart</span>
              <p className="text-sm font-bold text-[#001229]">Carrinho do Caixa Vazio</p>
              <p className="text-xs text-[#74777e] mt-1 max-w-xs">
                Escaneie um código de barras [F2] ou clique nos itens rápidos à esquerda para registrar produtos na venda.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#e7eeff] text-[11px] text-[#74777e] uppercase tracking-wider z-10 border-b border-[#c4c6ce]/40">
                <tr>
                  <th className="py-2 px-3 text-center w-8">#</th>
                  <th className="py-2 px-2">Produto & Acabamento</th>
                  <th className="py-2 px-2 text-right">Unitário</th>
                  <th className="py-2 px-2 text-center w-28">Qtd</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c4c6ce]/20 text-xs">
                {cart.map((item, idx) => (
                  <tr key={item.product.id} className="hover:bg-[#f0f3ff]/60 transition-colors group">
                    <td className="py-2 px-3 text-center font-mono text-[#74777e]">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2 px-2">
                      <div className="font-bold text-[#001229] leading-snug">
                        {item.product.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/20"
                          style={{ backgroundColor: item.product.swatchHex }}
                        />
                        <span className="text-[11px] text-[#74777e] font-semibold">
                          {item.product.colorName} • {item.product.finish}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#e7eeff] text-[#001229]">
                          {item.product.sku}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[#001229]">
                      R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="inline-flex items-center border border-[#c4c6ce]/60 rounded-lg bg-white shadow-xs">
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-[#74777e] hover:text-[#001229] hover:bg-[#e7eeff] transition-colors active:scale-90 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-xs text-[#001229]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#74777e] hover:text-[#001229] hover:bg-[#e7eeff] transition-colors active:scale-90 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-[#001229]">
                      R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => onRemoveFromCart(item.product.id)}
                        className="text-[#74777e] hover:text-[#ba1a1a] transition-colors p-1 cursor-pointer"
                        title="Remover Item"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Rodapé do Carrinho com Contagem de Volumes e Desconto */}
        <div className="p-3 bg-[#f0f3ff]/80 border-t border-[#c4c6ce]/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#e7eeff] text-[#001229] font-mono text-xs font-bold">
                {totalItemsCount} Volumes
              </span>
              <span className="text-xs text-[#74777e]">
                Peso Total Aprox.: {totalWeightKg} kg
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#74777e] font-semibold">Desconto [F5]:</span>
              <div className="flex items-center bg-white rounded-lg border border-[#c4c6ce]/50 px-2 py-1">
                <span className="text-xs text-[#74777e] mr-1">CUPOM</span>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="w-16 p-0 text-center font-mono text-xs font-bold text-[#001229] uppercase border-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setCouponApplied(!couponApplied)}
                  className="cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-sm ${couponApplied ? 'text-emerald-600' : 'text-[#74777e]'}`}>
                    check_circle
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          COLUNA 3 (DIREITA - 3 COLUNAS): TOTAIS, PAGAMENTO RÁPIDO & KEYPAD
          ========================================================================= */}
      <section className="col-span-12 xl:col-span-3 flex flex-col h-full bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden p-3 justify-between">
        <div>
          {/* Top Section: Totais da Venda */}
          <div className="bg-[#f0f3ff] rounded-xl p-3 border border-[#c4c6ce]/40 mb-3 shadow-inner">
            <div className="space-y-1.5 pb-2.5 border-b border-[#c4c6ce]/30 text-xs">
              <div className="flex justify-between items-center text-[#74777e]">
                <span>Subtotal Itens:</span>
                <span className="font-mono text-[#001229] font-semibold">
                  R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-emerald-700">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">sell</span>
                  Desconto Aplicado (5%):
                </span>
                <span className="font-mono font-bold">
                  - R$ {discountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-[#74777e]">
                <span>Frete / Entrega:</span>
                <span className="font-mono text-emerald-700 font-semibold">GRÁTIS</span>
              </div>
            </div>

            {/* Total Gigante */}
            <div className="pt-2 flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-bold">
                Total a Pagar
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-[20px] font-extrabold text-[#00687a]">R$</span>
                <span className="text-[32px] font-extrabold text-[#001229] tracking-tight font-mono">
                  {totalToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Seletor de Métodos de Pagamento */}
          <div>
            <label className="block text-[11px] text-[#74777e] font-bold uppercase tracking-wider mb-1.5">
              Forma de Pagamento
            </label>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {/* PIX (Destaque Ativo) */}
              <button
                onClick={() => setSelectedPayment('pix')}
                className={`col-span-2 py-2 px-3 rounded-lg flex items-center justify-between transition-all cursor-pointer ${
                  selectedPayment === 'pix'
                    ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950 shadow-xs'
                    : 'bg-[#f0f3ff] hover:bg-[#dee8ff] border border-[#c4c6ce]/40 text-[#44474d]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-xl">qr_code_2</span>
                  <span className="text-xs font-bold">PIX Dinâmico</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white tracking-wide">
                  Confirmação Automática
                </span>
              </button>

              {/* Cartão Crédito */}
              <button
                onClick={() => setSelectedPayment('credito')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedPayment === 'credito'
                    ? 'bg-[#001229] text-white border-[#001229]'
                    : 'bg-[#f0f3ff] hover:bg-[#dee8ff] border-[#c4c6ce]/40 text-[#001229]'
                }`}
              >
                <span className="material-symbols-outlined text-base">credit_card</span>
                <span>Crédito [F6]</span>
              </button>

              {/* Cartão Débito */}
              <button
                onClick={() => setSelectedPayment('debito')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedPayment === 'debito'
                    ? 'bg-[#001229] text-white border-[#001229]'
                    : 'bg-[#f0f3ff] hover:bg-[#dee8ff] border-[#c4c6ce]/40 text-[#001229]'
                }`}
              >
                <span className="material-symbols-outlined text-base">payments</span>
                <span>Débito [F7]</span>
              </button>

              {/* Dinheiro */}
              <button
                onClick={() => setSelectedPayment('dinheiro')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedPayment === 'dinheiro'
                    ? 'bg-[#001229] text-white border-[#001229]'
                    : 'bg-[#f0f3ff] hover:bg-[#dee8ff] border-[#c4c6ce]/40 text-[#001229]'
                }`}
              >
                <span className="material-symbols-outlined text-base">attach_money</span>
                <span>Dinheiro</span>
              </button>

              {/* Faturado / Boleto */}
              <button
                onClick={() => setSelectedPayment('faturado')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedPayment === 'faturado'
                    ? 'bg-[#001229] text-white border-[#001229]'
                    : 'bg-[#f0f3ff] hover:bg-[#dee8ff] border-[#c4c6ce]/40 text-[#001229]'
                }`}
              >
                <span className="material-symbols-outlined text-base">assignment</span>
                <span>Faturado 30d</span>
              </button>
            </div>
          </div>

          {/* Teclado Numérico de Balcão e Troco Rápido */}
          <div className="bg-[#f0f3ff]/60 p-2 rounded-xl border border-[#c4c6ce]/30">
            <div className="flex items-center justify-between mb-1.5 px-1 text-xs">
              <span className="text-[#74777e]">Recebido:</span>
              <span className="font-mono font-bold text-[#001229] text-sm">
                R$ {receivedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[#c4c6ce]">|</span>
              <span className="text-emerald-700 font-bold">Troco:</span>
              <span className="font-mono font-bold text-emerald-800 text-sm">
                R$ {changeAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Grade 3x4 Teclado Numérico */}
            <div className="grid grid-cols-3 gap-1">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="h-9 rounded bg-white text-[#001229] font-mono font-bold border border-[#c4c6ce]/40 hover:bg-[#e7eeff] active:bg-[#57dffe]/30 transition-colors shadow-xs cursor-pointer text-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress('backspace')}
                className="h-9 rounded bg-[#ffdad6]/40 text-[#ba1a1a] font-bold border border-[#ffdad6] hover:bg-[#ffdad6] active:scale-95 transition-colors flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">backspace</span>
              </button>
            </div>
          </div>
        </div>

        {/* Persistent Giant Bottom Checkout Actions */}
        <div className="mt-3 space-y-2">
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#0f2744] via-[#001229] to-[#00687a] text-white font-bold shadow-md hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-between group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-[#57dffe]">point_of_sale</span>
              <span className="tracking-tight text-white font-bold text-sm">FINALIZAR VENDA</span>
            </div>
            <span className="px-2.5 py-1 rounded bg-white/20 text-white font-mono text-xs backdrop-blur-xs border border-white/20 font-bold">
              F12
            </span>
          </button>

          <button
            onClick={() => alert(`Orçamento gerado para ${client.name} no valor de R$ ${totalToPay.toFixed(2)}.`)}
            className="w-full py-2 px-3 rounded-lg bg-[#f0f3ff] hover:bg-[#dee8ff] border border-[#c4c6ce]/40 text-[#44474d] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">print</span>
            <span>Imprimir Orçamento / Salvar [F4]</span>
          </button>

          {/* Suspender / Salvar Pedido e Recuperar Pedidos Salvos */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  triggerNotification('Adicione itens ao carrinho antes de suspender um pedido.', 'info');
                  return;
                }
                setIsSaveOrderModalOpen(true);
              }}
              disabled={cart.length === 0}
              className="py-2 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              title="Suspender carrinho e liberar caixa [F6]"
            >
              <span className="material-symbols-outlined text-base text-indigo-700">bookmark_add</span>
              <span>[F6] Salvar</span>
            </button>

            <button
              type="button"
              onClick={() => setIsViewSavedOrdersModalOpen(true)}
              className={`py-2 px-2.5 rounded-lg border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                currentSavedOrders.length > 0
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                  : 'bg-[#f0f3ff] hover:bg-[#dee8ff] text-[#44474d] border-[#c4c6ce]/40'
              }`}
              title="Visualizar e recuperar pedidos suspensos"
            >
              <span className="material-symbols-outlined text-base text-amber-700">history_toggle_off</span>
              <span>Salvos</span>
              {currentSavedOrders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-mono font-black">
                  {currentSavedOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MODAL DE CONSULTA DE PREÇO (DEDICATED PRICE CHECK TERMINAL)
          ========================================================================= */}
      {isPriceCheckModalOpen && priceCheckedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsPriceCheckModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full border-2 border-indigo-600 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-800 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                  <span className="material-symbols-outlined text-2xl">price_check</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base tracking-wide uppercase">
                      Consulta de Preço & Estoque
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-indigo-950 font-black font-mono text-[10px] tracking-wider uppercase">
                      Modo Consulta [F3]
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200">
                    Dados e valor conferidos sem inclusão automática na venda
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPriceCheckModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Product Category and Codes Row */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold uppercase text-[11px]">
                    {priceCheckedProduct.category === 'automotiva'
                      ? '🚗 Linha Automotiva'
                      : priceCheckedProduct.category === 'imobiliaria'
                      ? '🏠 Linha Imobiliária'
                      : priceCheckedProduct.category === 'vernizes'
                      ? '✨ Vernizes & Seladoras'
                      : priceCheckedProduct.category === 'acessorios'
                      ? '🛠 Ferramentas & EPI'
                      : '🎨 Complementos & Tintas'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-semibold text-[11px]">
                    {priceCheckedProduct.brand}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-600">
                  <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-900">
                    SKU: {priceCheckedProduct.sku}
                  </span>
                  {priceCheckedProduct.barcode && (
                    <span className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-indigo-900 font-bold">
                      EAN: {priceCheckedProduct.barcode}
                    </span>
                  )}
                </div>
              </div>

              {/* Product Title and Swatch Header */}
              <div className="flex items-start gap-4">
                <div
                  className="w-16 h-16 rounded-xl border-2 border-black/15 shrink-0 shadow-inner flex items-center justify-center relative overflow-hidden"
                  style={{ backgroundColor: priceCheckedProduct.swatchHex }}
                >
                  {priceCheckedProduct.swatchDot && (
                    <span
                      className="w-6 h-6 rounded-full border border-white/50 shadow-md"
                      style={{ backgroundColor: priceCheckedProduct.swatchDot }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xl font-black text-slate-900 leading-snug">
                    {priceCheckedProduct.name}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 font-medium">
                    {priceCheckedProduct.colorName && (
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">Cor:</span>
                        <span>{priceCheckedProduct.colorName}</span>
                      </span>
                    )}
                    {priceCheckedProduct.finish && (
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">Acabamento:</span>
                        <span className="capitalize">{priceCheckedProduct.finish}</span>
                      </span>
                    )}
                    {priceCheckedProduct.volume && (
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">Embalagem:</span>
                        <span>{priceCheckedProduct.volume}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Giant Price Card (Hero View) */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/60 border-2 border-emerald-300 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                      Preço à Vista (PIX / Dinheiro - 5% OFF)
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-lg font-bold text-emerald-900 font-mono">R$</span>
                      <span className="text-4xl font-black text-emerald-950 font-mono tracking-tight">
                        {(priceCheckedProduct.price * 0.95).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-medium">
                      Economia de R$ {(priceCheckedProduct.price * 0.05).toFixed(2).replace('.', ',')} no pagamento imediato
                    </span>
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-emerald-200/80 pt-2 sm:pt-0 sm:pl-4">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Preço Cartão / A Prazo
                    </span>
                    <span className="text-2xl font-black text-slate-900 font-mono block">
                      R$ {priceCheckedProduct.price.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-xs text-slate-600 font-medium block mt-0.5">
                      ou até <strong>3x de R$ {(priceCheckedProduct.price / 3).toFixed(2).replace('.', ',')}</strong> sem juros
                    </span>
                  </div>
                </div>
              </div>

              {/* Stock and Technical Specifications Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Stock Level */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-semibold mb-1">
                    <span className="material-symbols-outlined text-base text-indigo-700">inventory_2</span>
                    <span>Estoque Atual</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">
                      {priceCheckedProduct.stock}
                    </span>
                    <span className="text-slate-600 font-medium">unidades</span>
                  </div>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      priceCheckedProduct.stock > 10
                        ? 'bg-emerald-100 text-emerald-800'
                        : priceCheckedProduct.stock > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {priceCheckedProduct.stock > 10
                      ? '✓ Pronta Entrega'
                      : priceCheckedProduct.stock > 0
                      ? '⚠ Estoque Baixo'
                      : '✖ Esgotado'}
                  </span>
                </div>

                {/* Packaging & Dilution */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-semibold mb-1">
                    <span className="material-symbols-outlined text-base text-indigo-700">science</span>
                    <span>Rendimento & Aplicação</span>
                  </div>
                  <p className="font-semibold text-slate-800">
                    {priceCheckedProduct.category === 'automotiva'
                      ? 'Catálise 2:1 c/ catalisador PU'
                      : '2 a 3 demãos c/ rolo ou pistola'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {priceCheckedProduct.volume
                      ? `Volume: ${priceCheckedProduct.volume}`
                      : 'Consulte boletim técnico da fábrica'}
                  </p>
                </div>

                {/* Storage Location */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-semibold mb-1">
                    <span className="material-symbols-outlined text-base text-indigo-700">warehouse</span>
                    <span>Localização Estoque</span>
                  </div>
                  <p className="font-bold text-slate-900 font-mono">
                    {priceCheckedProduct.category === 'automotiva'
                      ? 'Setor Auto • Prateleira A-02'
                      : priceCheckedProduct.category === 'vernizes'
                      ? 'Setor Químicos • Baia 04'
                      : 'Setor Tintas • Corredor C'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Prateleira identificada no sistema
                  </p>
                </div>
              </div>

              {/* Informative Scanner Hint */}
              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/60 flex items-center justify-between text-xs text-indigo-900">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-700 text-lg">barcode_scanner</span>
                  <span>
                    <strong>Dica de Caixa:</strong> você pode bipar o próximo produto agora mesmo com o leitor para consultar direto sem fechar esta tela!
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPriceCheckModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span>Nova Consulta / Fechar (Esc)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddToCart(priceCheckedProduct, 1);
                    playPOSBeep();
                    triggerNotification(
                      `✓ Produto adicionado ao carrinho: ${priceCheckedProduct.name} (${priceCheckedProduct.sku})`,
                      'success',
                      priceCheckedProduct
                    );
                    setIsPriceCheckModalOpen(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                  <span>Adicionar ao Carrinho (Enter)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SALVAR / SUSPENDER PEDIDO ATUAL [F6]
          ========================================================================= */}
      {isSaveOrderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsSaveOrderModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full border-2 border-indigo-600 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-800 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                  <span className="material-symbols-outlined text-xl">bookmark_add</span>
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-wide uppercase">
                    Salvar / Suspender Pedido
                  </h3>
                  <p className="text-[11px] text-indigo-200">
                    O carrinho será guardado e o caixa liberado imediatamente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveOrderModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3.5">
              {/* Resumo do pedido suspenso */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">Cliente Vinculado</span>
                  <span className="text-xs font-bold text-slate-900">{client.name}</span>
                  <span className="text-[10px] text-slate-500 block">{client.segment} • {totalItemsCount} unidade(s)</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 font-semibold block">Total a Pagar</span>
                  <span className="text-lg font-black font-mono text-emerald-800">
                    R$ {totalToPay.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Campo de Identificação / Observação */}
              <div>
                <label className="text-xs font-bold text-slate-900 block mb-1">
                  Motivo ou Identificação do Pedido:
                </label>
                <input
                  type="text"
                  value={saveOrderNote}
                  onChange={(e) => setSaveOrderNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCurrentOrder(saveOrderNote);
                    }
                  }}
                  autoFocus
                  placeholder="Ex: Foi buscar documento no carro / Aguardando pintor..."
                  className="w-full h-10 px-3 rounded-lg border-2 border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 text-xs text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>

              {/* Pílulas de sugestão rápida de motivo */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Sugestões Rápidas:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Foi ao carro buscar carteira',
                    'Aguardando pintor aprovar',
                    'Buscando mais latas',
                    'Conferência no estoque',
                    'Retirada à tarde',
                  ].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setSaveOrderNote(sug)}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-[10px] font-medium text-slate-700 transition-colors cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsSaveOrderModalOpen(false)}
                className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cancelar (Esc)
              </button>
              <button
                type="button"
                onClick={() => handleSaveCurrentOrder(saveOrderNote)}
                className="px-4 py-2 rounded-lg bg-indigo-800 hover:bg-indigo-900 active:scale-95 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">bookmark_check</span>
                <span>Suspender & Liberar Caixa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: PEDIDOS SALVOS & SUSPENSOS EM ESPERA
          ========================================================================= */}
      {isViewSavedOrdersModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsViewSavedOrdersModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full border-2 border-amber-500 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <span className="material-symbols-outlined text-2xl">history_toggle_off</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base tracking-wide uppercase">
                      Pedidos Salvos / Suspensos
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black font-mono text-[10px]">
                      {currentSavedOrders.length} em espera
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Selecione um pedido salvo para retomar a venda ou mesclar ao carrinho
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsViewSavedOrdersModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* List of Suspended Orders */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {currentSavedOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <span className="material-symbols-outlined text-5xl mb-2 text-slate-300">inbox</span>
                  <p className="font-bold text-slate-800 text-sm">Nenhum pedido suspenso no momento</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Quando precisar liberar o caixa para atender outro cliente enquanto alguém busca um item, use o botão <strong>Salvar Pedido [F6]</strong>.
                  </p>
                </div>
              ) : (
                currentSavedOrders.map((order) => {
                  const itemCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
                  return (
                    <div
                      key={order.id}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all bg-white flex flex-col gap-2.5"
                    >
                      {/* Top Order Row */}
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 font-mono font-bold">
                            #{order.orderNumber}
                          </span>
                          <span className="text-slate-500 font-medium">
                            🕒 Salvo às {order.timestamp}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px]">
                            {order.note}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-mono font-black text-sm text-emerald-800">
                            R$ {order.total.toFixed(2).replace('.', ',')}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {itemCount} un ({order.items.length} itens)
                          </span>
                        </div>
                      </div>

                      {/* Client Info */}
                      <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <strong className="text-slate-900">{order.client.name}</strong> •{' '}
                          <span className="text-slate-500">{order.client.segment}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pagamento: <strong className="uppercase">{order.selectedPayment || 'PIX'}</strong>
                        </div>
                      </div>

                      {/* Items Preview Chips */}
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {order.items.slice(0, 3).map((it) => (
                          <span
                            key={it.product.id}
                            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 flex items-center gap-1 font-medium"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                              style={{ backgroundColor: it.product.swatchHex }}
                            />
                            <span>{it.quantity}x {it.product.name.split(' ')[0]}</span>
                          </span>
                        ))}
                        {order.items.length > 3 && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                            +{order.items.length - 3} outro(s)
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Deseja realmente descartar e excluir o pedido #${order.orderNumber}?`)) {
                              handleDeleteSuspendedOrder(order.id);
                            }
                          }}
                          className="text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          <span>Descartar</span>
                        </button>

                        <div className="flex items-center gap-2">
                          {cart.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRestoreSuspendedOrder(order, 'merge')}
                              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Adicionar itens ao carrinho atual sem esvaziar"
                            >
                              <span className="material-symbols-outlined text-sm">call_merge</span>
                              <span>Mesclar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (cart.length > 0) {
                                if (!confirm('O carrinho atual possui itens. Deseja substituí-los pelo pedido recuperado?')) {
                                  return;
                                }
                              }
                              handleRestoreSuspendedOrder(order, 'replace');
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">replay</span>
                            <span>Retomar Venda</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Dica: você pode salvar vários pedidos simultâneos no PDV.
              </span>
              <button
                type="button"
                onClick={() => setIsViewSavedOrdersModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 font-bold text-slate-700 cursor-pointer"
              >
                Fechar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
