import React, { useState } from 'react';
import { ProductItem } from '../types';

interface TintometriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustomFormulaToCart: (product: ProductItem) => void;
}

const POPULAR_COLORS = [
  // Linha Imobiliária & Arquitetônica
  { name: 'Azul Profundo Marques', hex: '#0f2744', base: 'C' as const, finish: 'Acetinado', code: 'MAR-804', type: 'imobiliaria' as const },
  { name: 'Cinza Urbano Nórdico', hex: '#64748b', base: 'A' as const, finish: 'Fosco', code: 'LUK-210', type: 'imobiliaria' as const },
  { name: 'Terracota Colonial', hex: '#c2410c', base: 'B' as const, finish: 'Acetinado', code: 'SUV-540', type: 'imobiliaria' as const },
  { name: 'Verde Eucalipto Fachada', hex: '#166534', base: 'C' as const, finish: 'Fosco', code: 'COR-312', type: 'imobiliaria' as const },
  { name: 'Off-White Gelo Suave', hex: '#f8fafc', base: 'A' as const, finish: 'Fosco', code: 'SW-7005', type: 'imobiliaria' as const },
  { name: 'Preto Nobre Alto Brilho', hex: '#0f172a', base: 'D' as const, finish: 'Brilhante', code: 'MAR-900', type: 'imobiliaria' as const },
  // Linha Automotiva & Fórmulas Originais
  { name: 'Preto Ninja PU (Automotivo)', hex: '#0a0a0a', base: 'D' as const, finish: 'Alto Brilho', code: 'AUTO-NINJA', type: 'automotiva' as const },
  { name: 'Prata Bari Metálico (Automotivo)', hex: '#cbd5e1', base: 'B' as const, finish: 'Metálico', code: 'AUTO-BARI', type: 'automotiva' as const },
  { name: 'Vermelho Flash VW (Automotivo)', hex: '#dc2626', base: 'C' as const, finish: 'Alto Brilho', code: 'AUTO-FLASH', type: 'automotiva' as const },
  { name: 'Branco Banchisa 2K (Automotivo)', hex: '#ffffff', base: 'A' as const, finish: 'Alto Brilho', code: 'AUTO-BANCHISA', type: 'automotiva' as const },
  { name: 'Cinza Nardo Audi (Automotivo)', hex: '#6b7280', base: 'B' as const, finish: 'Alto Brilho', code: 'AUTO-NARDO', type: 'automotiva' as const },
  { name: 'Azul Portimao BMW Metálico', hex: '#1d4ed8', base: 'C' as const, finish: 'Metálico', code: 'AUTO-PORTIMAO', type: 'automotiva' as const },
];

export const TintometriaModal: React.FC<TintometriaModalProps> = ({
  isOpen,
  onClose,
  onAddCustomFormulaToCart,
}) => {
  const [lineFilter, setLineFilter] = useState<'todos' | 'imobiliaria' | 'automotiva'>('todos');
  const [selectedColor, setSelectedColor] = useState(POPULAR_COLORS[0]);
  const [selectedBase, setSelectedBase] = useState<'A' | 'B' | 'C' | 'D'>('C');
  const [selectedVolume, setSelectedVolume] = useState<'3.6L' | '18L' | '900ml'>('18L');
  const [finish, setFinish] = useState('Acetinado (20%)');
  const [isDispensing, setIsDispensing] = useState(false);
  const [dispenseProgress, setDispenseProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  if (!isOpen) return null;

  const handleStartMixing = () => {
    setIsDispensing(true);
    setDispenseProgress(0);
    setIsReady(false);

    let current = 0;
    const interval = setInterval(() => {
      current += 20;
      setDispenseProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        setIsDispensing(false);
        setIsReady(true);
      }
    }, 400);
  };

  const isAutomotive = selectedColor.type === 'automotiva';

  // Calculate pricing based on volume and line
  const calculatePrice = () => {
    if (isAutomotive) {
      if (selectedVolume === '900ml') return 119.90;
      if (selectedVolume === '3.6L') return 295.00;
      return 680.00;
    }
    if (selectedVolume === '18L') return 429.00;
    if (selectedVolume === '3.6L') return 148.50;
    return 54.00;
  };

  const currentPrice = calculatePrice();

  const handleAddToCart = () => {
    const customProduct: ProductItem = {
      id: `custom-tint-${Date.now()}`,
      sku: `TINT-${selectedColor.code}-${selectedVolume}`,
      colorName: selectedColor.name,
      swatchHex: selectedColor.hex,
      name: isAutomotive
        ? `Tinta Automotiva Especial ${selectedColor.name} ${selectedVolume}`
        : `Tinta Especial Tintométrica ${selectedColor.name} ${selectedVolume}`,
      description: isAutomotive
        ? `Fórmula Automotiva ${selectedColor.code} • Base ${selectedBase} • ${finish}`
        : `Fórmula ${selectedColor.code} • Base ${selectedBase} • ${finish}`,
      category: isAutomotive ? 'automotiva' : 'imobiliaria',
      brand: isAutomotive ? 'MarquesColor Auto Tint' : 'MarquesColor Tintométrica',
      finish: finish.split(' ')[0],
      glossPercent: isAutomotive ? '98%' : '20%',
      glossDotColor: isAutomotive ? '#57dffe' : '#00687a',
      price: currentPrice,
      stock: 1,
      stockUnit: 'lata dosada',
      volumeToday: 1,
      volumeUnit: 'lata',
      salesTotal: currentPrice,
      baseType: selectedBase,
    };

    onAddCustomFormulaToCart(customProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-2xl border border-[#c4c6ce]/60 shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00687a] to-[#57dffe] flex items-center justify-center text-[#001229] shadow-xs">
              <span className="material-symbols-outlined text-2xl font-bold">tune</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Laboratório & Dosador Tintométrico MarquesColor
                </h3>
                <span className="px-2 py-0.2 rounded bg-[#57dffe]/20 text-[#57dffe] text-[10px] font-mono font-bold">
                  COM3 CONECTADA
                </span>
              </div>
              <p className="text-xs text-[#798fb1]">
                Calibração volumétrica de pigmentos e injeção em base arquitetônica
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#798fb1] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[80vh] overflow-y-auto">
          {/* Left: Swatch & Machine Simulator (5 Cols) */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            {/* Color Swatch Big Card */}
            <div className="rounded-xl border border-[#c4c6ce]/50 p-4 bg-[#f0f3ff] text-center">
              <div
                className="w-full h-36 rounded-lg shadow-inner relative flex items-center justify-center border border-black/10 transition-colors"
                style={{ backgroundColor: selectedColor.hex }}
              >
                <div className="bg-black/40 backdrop-blur-xs px-3 py-1.5 rounded-lg text-white font-mono font-bold text-xs border border-white/20">
                  {selectedColor.code} • {selectedColor.hex}
                </div>
              </div>
              <div className="mt-3">
                <h4 className="text-base font-bold text-[#001229]">{selectedColor.name}</h4>
                <p className="text-xs text-[#74777e] mt-0.5">
                  Base recomendada: <b className="text-[#00687a]">Base {selectedColor.base}</b> • {finish}
                </p>
              </div>
            </div>

            {/* Pigment Canisters Status */}
            <div className="p-3 bg-white rounded-xl border border-[#c4c6ce]/50 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#001229]">
                <span>Níveis dos Canisters (Pigmentos)</span>
                <span className="text-[10px] text-emerald-700 font-mono">Bicos Aferidos</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-mono">
                <div>
                  <div className="h-14 bg-[#f0f3ff] rounded p-1 flex flex-col justify-end">
                    <div className="bg-amber-400 w-full rounded-xs" style={{ height: '85%' }}></div>
                  </div>
                  <span className="text-[9px] text-[#44474d] block mt-1">Amarelo</span>
                </div>
                <div>
                  <div className="h-14 bg-[#f0f3ff] rounded p-1 flex flex-col justify-end">
                    <div className="bg-blue-600 w-full rounded-xs" style={{ height: '92%' }}></div>
                  </div>
                  <span className="text-[9px] text-[#44474d] block mt-1">Azul</span>
                </div>
                <div>
                  <div className="h-14 bg-[#f0f3ff] rounded p-1 flex flex-col justify-end">
                    <div className="bg-rose-600 w-full rounded-xs" style={{ height: '70%' }}></div>
                  </div>
                  <span className="text-[9px] text-[#44474d] block mt-1">Vermelho</span>
                </div>
                <div>
                  <div className="h-14 bg-[#f0f3ff] rounded p-1 flex flex-col justify-end">
                    <div className="bg-slate-900 w-full rounded-xs" style={{ height: '95%' }}></div>
                  </div>
                  <span className="text-[9px] text-[#44474d] block mt-1">Preto</span>
                </div>
                <div>
                  <div className="h-14 bg-[#f0f3ff] rounded p-1 flex flex-col justify-end">
                    <div className="bg-slate-200 border border-slate-400 w-full rounded-xs" style={{ height: '88%' }}></div>
                  </div>
                  <span className="text-[9px] text-[#44474d] block mt-1">Branco</span>
                </div>
              </div>
            </div>

            {/* Dispense action & status */}
            <div className="space-y-2">
              <button
                onClick={handleStartMixing}
                disabled={isDispensing}
                className="w-full py-2.5 px-4 rounded-xl bg-[#00687a] hover:bg-[#004e5c] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <span className={`material-symbols-outlined text-base ${isDispensing ? 'animate-spin' : ''}`}>
                  {isDispensing ? 'sync' : 'precision_manufacturing'}
                </span>
                <span>{isDispensing ? `Injetando Pigmento (${dispenseProgress}%)...` : 'Bater Fórmula na Máquina [F9]'}</span>
              </button>

              {isDispensing && (
                <div className="w-full h-2 bg-[#dee8ff] rounded-full overflow-hidden">
                  <div className="h-full bg-[#57dffe] transition-all duration-300" style={{ width: `${dispenseProgress}%` }}></div>
                </div>
              )}

              {isReady && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 animate-in fade-in">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span>Fórmula batida com precisão de 0.05ml. Pronta para envio ao caixa!</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Formulation Selectors (7 Cols) */}
          <div className="md:col-span-7 space-y-4 text-xs">
            {/* Palette preset colors with Category Tabs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-[#001229]">
                  1. Escolha a Cor Desejada no Catálogo
                </label>
                <div className="flex items-center gap-1 bg-[#f0f3ff] p-0.5 rounded-lg border border-[#c4c6ce]/40">
                  <button
                    type="button"
                    onClick={() => setLineFilter('todos')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      lineFilter === 'todos' ? 'bg-[#001229] text-white' : 'text-[#44474d] hover:text-[#001229]'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineFilter('imobiliaria')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      lineFilter === 'imobiliaria' ? 'bg-[#001229] text-white' : 'text-[#44474d] hover:text-[#001229]'
                    }`}
                  >
                    Imobiliárias
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineFilter('automotiva')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      lineFilter === 'automotiva' ? 'bg-[#001229] text-white' : 'text-[#44474d] hover:text-[#001229]'
                    }`}
                  >
                    Automotivas PU/Poliéster
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {POPULAR_COLORS.filter(col => lineFilter === 'todos' || col.type === lineFilter).map((col) => (
                  <button
                    key={col.code}
                    onClick={() => {
                      setSelectedColor(col);
                      setSelectedBase(col.base);
                      setIsReady(false);
                    }}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      selectedColor.code === col.code
                        ? 'border-[#001229] bg-[#f0f3ff] shadow-xs ring-1 ring-[#001229]'
                        : 'border-[#c4c6ce]/50 hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md shadow-xs shrink-0 border border-black/10"
                      style={{ backgroundColor: col.hex }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="font-bold text-[#001229] truncate text-[11px]">{col.name}</p>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#74777e] font-mono">
                        <span>{col.code}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded font-sans ${col.type === 'automotiva' ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800'}`}>
                          {col.type === 'automotiva' ? 'Auto' : 'Imob'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Base selection */}
            <div>
              <label className="block text-xs font-bold text-[#001229] mb-2">
                2. Base Arquitetônica do Fabricante
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { type: 'A' as const, name: 'Base A', desc: 'Branco Puro' },
                  { type: 'B' as const, name: 'Base B', desc: 'Médios' },
                  { type: 'C' as const, name: 'Base C', desc: 'Saturados' },
                  { type: 'D' as const, name: 'Base D', desc: 'Escuros' },
                ].map((b) => (
                  <button
                    key={b.type}
                    onClick={() => setSelectedBase(b.type)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selectedBase === b.type
                        ? 'border-[#00687a] bg-[#e7eeff] font-bold text-[#001229]'
                        : 'border-[#c4c6ce]/40 text-[#44474d]'
                    }`}
                  >
                    <p className="text-xs font-bold">{b.name}</p>
                    <p className="text-[10px] text-[#74777e]">{b.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Volume & Finish selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#001229] mb-1">
                  3. Embalagem / Volume
                </label>
                <div className="flex gap-1.5">
                  {(['18L', '3.6L', '900ml'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setSelectedVolume(v)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                        selectedVolume === v
                          ? 'bg-[#001229] text-white border-[#001229]'
                          : 'bg-[#f0f3ff] text-[#44474d] border-[#c4c6ce]/40'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001229] mb-1">
                  4. Acabamento / Brilho
                </label>
                <select
                  value={finish}
                  onChange={(e) => setFinish(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-[#c4c6ce]/60 bg-white text-xs text-[#001229] cursor-pointer"
                >
                  <option>Fosco (2%)</option>
                  <option>Acetinado (20%)</option>
                  <option>Semi-Brilho (50%)</option>
                  <option>Brilhante (85%)</option>
                </select>
              </div>
            </div>

            {/* Price Preview & Action */}
            <div className="p-3.5 bg-[#f0f3ff] rounded-xl border border-[#c4c6ce]/40 flex items-center justify-between mt-4">
              <div>
                <span className="text-[10px] text-[#74777e] uppercase font-bold tracking-wider">
                  Valor Estimado com Pigmentos {isAutomotive ? '(Linha Automotiva 2K/Poliéster)' : '(Linha Arquitetônica)'}
                </span>
                <div className="text-xl font-mono font-extrabold text-[#001229]">
                  R$ {currentPrice.toFixed(2).replace('.', ',')}
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                className="py-2.5 px-4 rounded-xl bg-[#0f2744] hover:bg-[#001229] text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-base text-[#57dffe]">add_shopping_cart</span>
                <span>Adicionar ao Carrinho PDV</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
