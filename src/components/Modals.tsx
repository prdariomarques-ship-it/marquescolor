import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { CompletedSaleData } from '../types';
import { STORE_CONFIG } from '../data/storeConfig';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'F1', desc: 'Manual e Guia Rápido de Teclas de Atalho' },
    { key: 'F2', desc: 'Busca Rápida de Barcode / Entrada Manual de SKU' },
    { key: 'F3', desc: 'Novo Pedido / Novo Orçamento Balcão' },
    { key: 'F4', desc: 'Imprimir Orçamento / Salvar Proposta' },
    { key: 'F5', desc: 'Aplicar Cupom de Desconto / Convênio' },
    { key: 'F6', desc: 'Selecionar Pagamento no Cartão de Crédito' },
    { key: 'F7', desc: 'Selecionar Pagamento no Cartão de Débito' },
    { key: 'F8', desc: 'Excluir Item Selecionado / Cancelar Venda' },
    { key: 'F9', desc: 'Dosagem Tintométrica de Pigmentos' },
    { key: 'F10', desc: 'Fechamento de Caixa / Sangria de Turno' },
    { key: 'F12', desc: 'Finalizar Venda e Emitir Cupom Não Fiscal' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-2xl border border-[#c4c6ce]/60 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#57dffe]">keyboard</span>
            <h3 className="text-sm font-bold">Manual de Atalhos MarquesColor POS</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#798fb1] hover:text-white cursor-pointer">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div className="divide-y divide-[#c4c6ce]/30 text-xs">
            {shortcuts.map(s => (
              <div key={s.key} className="py-2 flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-[#e7eeff] text-[#001229] font-mono font-bold text-xs border border-[#c4c6ce]/40">
                  [{s.key}]
                </span>
                <span className="text-[#44474d] text-right font-medium">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-[#f0f3ff] border-t border-[#c4c6ce]/30 text-center">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#001229] text-white font-bold text-xs hover:bg-[#0f2744] cursor-pointer"
          >
            Entendido [Esc]
          </button>
        </div>
      </div>
    </div>
  );
};

interface CloseCashierModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloseCashierModal: React.FC<CloseCashierModalProps> = ({ isOpen, onClose }) => {
  const [sangriaAmount, setSangriaAmount] = useState('1450.00');
  const [closedSuccess, setClosedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFinishClosing = () => {
    setClosedSuccess(true);
    setTimeout(() => {
      setClosedSuccess(false);
      onClose();
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-2xl border border-[#c4c6ce]/60 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ba1a1a]">point_of_sale</span>
            <h3 className="text-sm font-bold">Fechamento de Caixa [F10]</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#798fb1] hover:text-white cursor-pointer">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs">
          {closedSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-emerald-600">verified</span>
              <p className="font-bold text-emerald-900 text-sm">Caixa Fechado com Sucesso!</p>
              <p className="text-xs text-emerald-700">
                Sangria de <strong>R$ {sangriaAmount}</strong> recolhida ao cofre. Relatório de fechamento impresso.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-[#f0f3ff] border border-[#c4c6ce]/40 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#44474d]">Turno:</span>
                  <span className="font-bold text-[#001229]">Turno 1 - Manhã/Tarde</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474d]">Total Vendas Hoje:</span>
                  <span className="font-mono font-bold text-[#001229]">R$ 14.850,00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474d]">Dinheiro em Gaveta:</span>
                  <span className="font-mono font-bold text-emerald-700">R$ 1.450,00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474d]">PIX / Cartões / Faturado:</span>
                  <span className="font-mono font-bold text-[#001229]">R$ 13.400,00</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#001229] mb-1">Valor de Sangria / Recolhimento ao Cofre</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e] font-mono">
                    R$
                  </span>
                  <input
                    type="text"
                    value={sangriaAmount}
                    onChange={(e) => setSangriaAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-[#c4c6ce] rounded-lg text-xs font-mono font-bold text-[#001229]"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleFinishClosing}
                  className="flex-1 py-2 rounded-lg bg-[#ba1a1a] text-white font-bold text-xs hover:bg-red-700 cursor-pointer"
                >
                  Confirmar Fechamento
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-[#c4c6ce] text-[#44474d] font-semibold text-xs hover:bg-[#f0f3ff] cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface FinalizeSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: CompletedSaleData | null;
}

export const FinalizeSaleModal: React.FC<FinalizeSaleModalProps> = ({
  isOpen,
  onClose,
  saleData,
}) => {
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [activeTab, setActiveTab] = useState<'termica' | 'fiscal'>('termica');
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  if (!isOpen || !saleData) return null;

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const orderNum = saleData.orderNumber || 'PED-48920';
  const nfceNum = saleData.nfceNumber || '000.004.892';
  const serie = saleData.series || '001';
  const accessKey = saleData.accessKey || '4126 0918 2918 0200 0190 6500 1000 4892 1098 2177 1256';
  const protocol = saleData.protocol || '141260098412891';
  const timestamp = saleData.timestamp || new Date().toLocaleString('pt-BR');
  const operator = saleData.operatorName || 'Dario Marques (Operador 01)';
  const items = saleData.items && saleData.items.length > 0
    ? saleData.items
    : [
        {
          product: {
            id: 'mock-1',
            sku: 'SUV-ACR-018',
            name: 'Tinta Acrílica Fosco Clássico Branco Neve 18L',
            price: saleData.total,
            category: 'imobiliaria' as const,
            brand: 'Suvinil',
            finish: 'Fosco',
            glossPercent: '3%',
            stock: 45,
            stockUnit: 'latas',
            volumeToday: 1,
            volumeUnit: 'latas',
            salesTotal: saleData.total,
            baseType: 'A' as const,
          },
          quantity: 1,
        }
      ];

  const totalItemsCount = items.reduce((acc, it) => acc + it.quantity, 0);
  const subtotal = saleData.subtotal || saleData.total;
  const discount = saleData.discount || 0;
  const total = saleData.total;

  // =========================================================================
  // 1. GERAR E BAIXAR ARQUIVO PDF VETORIAL (FORMATO BOBINA TÉRMICA 80mm)
  // =========================================================================
  const handleDownloadPDF = () => {
    try {
      // Calculate dynamic paper length based on item lines
      const estimatedHeight = Math.max(190, 150 + items.length * 10);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, estimatedHeight],
      });

      let y = 8;
      const margin = 5;
      const right = 75;
      const center = 40;

      // Header Empresa
      doc.setFont('courier', 'bold');
      doc.setFontSize(9.5);
      doc.text(STORE_CONFIG.name, center, y, { align: 'center' });
      y += 4;
      doc.setFontSize(7.5);
      doc.setFont('courier', 'normal');
      doc.text(STORE_CONFIG.address, center, y, { align: 'center' });
      y += 3.5;
      doc.setFontSize(6);
      doc.text(`${STORE_CONFIG.neighborhood} - ${STORE_CONFIG.city} - ${STORE_CONFIG.state}`, center, y, { align: 'center' });
      y += 3;
      doc.text(`CNPJ: ${STORE_CONFIG.cnpj} • Fone: ${STORE_CONFIG.phone}`, center, y, { align: 'center' });
      y += 3;

      // Divider
      doc.text('------------------------------------------------', center, y, { align: 'center' });
      y += 3.5;

      // Cupom Não Fiscal Header
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.text('*** CUPOM NÃO FISCAL ***', center, y, { align: 'center' });
      y += 3;
      doc.setFontSize(6);
      doc.setFont('courier', 'normal');
      doc.text('NÃO É DOCUMENTO FISCAL', center, y, { align: 'center' });
      y += 3;
      doc.text('COMPROVANTE DE VENDA A CONSUMIDOR', center, y, { align: 'center' });
      y += 3.5;
      doc.text(`Pedido/Venda nº: ${orderNum}`, margin, y);
      y += 3;
      doc.text(`Data/Hora: ${timestamp}`, margin, y);
      y += 3;
      doc.text(`Operador: ${operator}`, margin, y);
      y += 3;

      // Divider
      doc.text('------------------------------------------------', center, y, { align: 'center' });
      y += 3.5;

      // Consumer
      doc.setFont('courier', 'bold');
      doc.text('CONSUMIDOR:', margin, y);
      y += 3;
      doc.setFont('courier', 'normal');
      doc.text(`Nome: ${saleData.client.name.substring(0, 30)}`, margin, y);
      y += 3;
      doc.text(`Doc: ${saleData.client.doc} (${saleData.client.docType})`, margin, y);
      y += 3;

      // Divider
      doc.text('------------------------------------------------', center, y, { align: 'center' });
      y += 3.5;

      // Items Column Header
      doc.setFont('courier', 'bold');
      doc.text('# CÓDIGO  DESCRIÇÃO', margin, y);
      y += 3;
      doc.text('  QTD x UNIT                         TOTAL', margin, y);
      y += 3;
      doc.setFont('courier', 'normal');
      doc.text('- - - - - - - - - - - - - - - - - - - - - - - -', center, y, { align: 'center' });
      y += 3;

      // Items List
      items.forEach((item, index) => {
        const itemNum = (index + 1).toString().padStart(3, '0');
        const sku = item.product.sku || 'ITEM';
        const rawName = item.product.name;
        const truncatedName = rawName.length > 24 ? rawName.substring(0, 24) + '..' : rawName;
        const itemTotal = (item.quantity * item.product.price).toFixed(2);

        doc.setFont('courier', 'bold');
        doc.text(`${itemNum} ${sku} ${truncatedName}`, margin, y);
        y += 3;
        doc.setFont('courier', 'normal');
        doc.text(`   ${item.quantity} UN x R$ ${item.product.price.toFixed(2)}`, margin, y);
        doc.setFont('courier', 'bold');
        doc.text(`R$ ${itemTotal}`, right, y, { align: 'right' });
        doc.setFont('courier', 'normal');
        y += 3.5;
      });

      // Divider
      doc.text('------------------------------------------------', center, y, { align: 'center' });
      y += 3.5;

      // Subtotal, Discount & Total
      doc.setFont('courier', 'normal');
      doc.text(`Qtd. Total de Itens:`, margin, y);
      doc.text(`${totalItemsCount}`, right, y, { align: 'right' });
      y += 3;

      if (discount > 0) {
        doc.text(`Subtotal dos Produtos:`, margin, y);
        doc.text(`R$ ${subtotal.toFixed(2)}`, right, y, { align: 'right' });
        y += 3;
        doc.text(`Desconto Concedido:`, margin, y);
        doc.text(`- R$ ${discount.toFixed(2)}`, right, y, { align: 'right' });
        y += 3;
      }

      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.text(`VALOR TOTAL R$:`, margin, y);
      doc.text(`R$ ${total.toFixed(2)}`, right, y, { align: 'right' });
      y += 4;
      doc.setFontSize(6);

      // Payment Details
      doc.setFont('courier', 'normal');
      doc.text(`FORMA DE PAGAMENTO:`, margin, y);
      doc.setFont('courier', 'bold');
      doc.text(`${saleData.paymentMethod}`, right, y, { align: 'right' });
      y += 3;
      doc.setFont('courier', 'normal');
      doc.text(`Valor Pago:`, margin, y);
      doc.text(`R$ ${saleData.receivedAmount.toFixed(2)}`, right, y, { align: 'right' });
      y += 3;

      if (saleData.changeAmount > 0) {
        doc.text(`Troco:`, margin, y);
        doc.setFont('courier', 'bold');
        doc.text(`R$ ${saleData.changeAmount.toFixed(2)}`, right, y, { align: 'right' });
        doc.setFont('courier', 'normal');
        y += 3;
      }

      // Divider
      doc.text('------------------------------------------------', center, y, { align: 'center' });
      y += 3.5;

      // Non-fiscal policy and footer
      doc.text(STORE_CONFIG.policyNotice, center, y, { align: 'center' });
      y += 3;
      doc.text(`Código de Controle: ${orderNum}-${Date.now().toString().slice(-4)}`, center, y, { align: 'center' });
      y += 3;
      doc.setFont('courier', 'bold');
      doc.text('MARQUESCOLOR TINTAS', center, y, { align: 'center' });
      y += 3;
      doc.setFont('courier', 'normal');
      doc.text('Obrigado pela preferência! Volte Sempre.', center, y, { align: 'center' });

      // Save PDF file
      const fileName = `Cupom_Nao_Fiscal_${orderNum}_${Date.now().toString().slice(-4)}.pdf`;
      doc.save(fileName);
      showToast(`✓ PDF "${fileName}" gerado e baixado com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      showToast('Não foi possível gerar o PDF da venda.', 'info');
    }
  };

  // =========================================================================
  // 2. IMPRESSÃO TÉRMICA REAL (80mm / 58mm via Iframe / Diálogo Nativo)
  // =========================================================================
  const handlePrintThermal = () => {
    try {
      const itemsHtml = items.map((it, idx) => {
        const itemTotal = (it.quantity * it.product.price).toFixed(2);
        return `
          <div style="margin-bottom: 4px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>${(idx + 1).toString().padStart(3, '0')} ${it.product.sku}</span>
              <span>R$ ${itemTotal}</span>
            </div>
            <div style="font-size: 10px; color: #111;">${it.product.name}</div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #444;">
              <span>${it.quantity} UN x R$ ${it.product.price.toFixed(2)}</span>
            </div>
          </div>
        `;
      }).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Cupom Não Fiscal - Pedido ${orderNum}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 2mm 3mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              width: 74mm;
              margin: 0 auto;
              padding: 4px 2px;
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.25;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .divider {
              border-bottom: 1px dashed #000;
              margin: 5px 0;
            }
            .flex-between {
              display: flex;
              justify-content: space-between;
            }
            .total-row {
              font-size: 13px;
              font-weight: bold;
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 13px;">${STORE_CONFIG.name}</div>
          <div class="center" style="font-size: 9.5px;">CNPJ: ${STORE_CONFIG.cnpj}</div>
          <div class="center" style="font-size: 9px;">${STORE_CONFIG.address}</div>
          <div class="center" style="font-size: 9px;">${STORE_CONFIG.neighborhood} - ${STORE_CONFIG.city}/${STORE_CONFIG.state}</div>
          <div class="center" style="font-size: 9px;">Telefone: ${STORE_CONFIG.phone}</div>

          <div class="divider"></div>

          <div class="center bold" style="font-size: 11px;">*** CUPOM NÃO FISCAL ***</div>
          <div class="center" style="font-size: 9px;">NÃO É DOCUMENTO FISCAL</div>
          <div class="center" style="font-size: 8.5px;">COMPROVANTE DE VENDA A CONSUMIDOR</div>

          <div class="divider"></div>

          <div class="flex-between" style="font-size: 10px;">
            <span>Pedido: ${orderNum}</span>
            <span>Data: ${timestamp}</span>
          </div>
          <div style="font-size: 9.5px; color: #333;">Operador: ${operator}</div>

          <div class="divider"></div>

          <div class="bold" style="font-size: 10px;">CONSUMIDOR:</div>
          <div style="font-size: 10px;">${saleData.client.name}</div>
          <div style="font-size: 9px;">Doc: ${saleData.client.doc} (${saleData.client.docType})</div>

          <div class="divider"></div>

          <div class="bold" style="font-size: 10px; margin-bottom: 4px;"># CÓDIGO | DESCRIÇÃO | QTD x UNIT | TOTAL</div>
          ${itemsHtml}

          <div class="divider"></div>

          <div class="flex-between" style="font-size: 10px;">
            <span>Qtd. Total de Itens:</span>
            <span>${totalItemsCount}</span>
          </div>

          ${discount > 0 ? `
            <div class="flex-between" style="font-size: 10px;">
              <span>Subtotal dos Produtos:</span>
              <span>R$ ${subtotal.toFixed(2)}</span>
            </div>
            <div class="flex-between" style="font-size: 10px;">
              <span>Desconto Aplicado:</span>
              <span>- R$ ${discount.toFixed(2)}</span>
            </div>
          ` : ''}

          <div class="total-row">
            <span>VALOR A PAGAR R$:</span>
            <span>R$ ${total.toFixed(2)}</span>
          </div>

          <div class="divider"></div>

          <div class="flex-between bold" style="font-size: 11px;">
            <span>FORMA PAGAMENTO:</span>
            <span>${saleData.paymentMethod}</span>
          </div>
          <div class="flex-between" style="font-size: 10px;">
            <span>Valor Recebido:</span>
            <span>R$ ${saleData.receivedAmount.toFixed(2)}</span>
          </div>
          ${saleData.changeAmount > 0 ? `
            <div class="flex-between bold" style="font-size: 10px;">
              <span>Troco:</span>
              <span>R$ ${saleData.changeAmount.toFixed(2)}</span>
            </div>
          ` : ''}

          <div class="divider"></div>

          <div class="center" style="font-size: 8.5px;">
            ${STORE_CONFIG.policyNotice}
          </div>

          <div class="divider"></div>

          <div class="center bold" style="font-size: 9.5px; margin-top: 4px;">
            ${STORE_CONFIG.name}
          </div>
          <div class="center" style="font-size: 9px;">
            Obrigado pela preferência! Volte Sempre.
          </div>
          <div class="center" style="font-size: 8px; margin-top: 8px;">
            ====================================
          </div>
        </body>
        </html>
      `;

      // Use hidden iframe to avoid leaving the app
      let iframe = printIframeRef.current;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        printIframeRef.current = iframe;
      }

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
          showToast('✓ Cupom não fiscal enviado para impressão!', 'success');
        }, 300);
      }
    } catch (err) {
      console.error('Erro na impressão térmica:', err);
      window.print();
    }
  };

  // =========================================================================
  // 3. COPIAR TEXTO DO CUPOM PARA WHATSAPP / E-MAIL
  // =========================================================================
  const handleCopyReceiptText = () => {
    const lines = [
      `🎨 *${STORE_CONFIG.name}*`,
      `CNPJ: ${STORE_CONFIG.cnpj}`,
      `${STORE_CONFIG.address} - ${STORE_CONFIG.neighborhood}`,
      `${STORE_CONFIG.city}/${STORE_CONFIG.state} • Tel: ${STORE_CONFIG.phone}`,
      `----------------------------------------`,
      `*CUPOM NÃO FISCAL - COMPROVANTE DE VENDA*`,
      `Pedido nº: ${orderNum}`,
      `Data: ${timestamp}`,
      `----------------------------------------`,
      `*Cliente:* ${saleData.client.name}`,
      `*CPF/CNPJ:* ${saleData.client.doc}`,
      `----------------------------------------`,
      `*ITENS DA COMPRA:*`,
      ...items.map((it, idx) => ` ${idx + 1}. ${it.product.name}\n    ${it.quantity} un x R$ ${it.product.price.toFixed(2)} = *R$ ${(it.quantity * it.product.price).toFixed(2)}*`),
      `----------------------------------------`,
      discount > 0 ? `Subtotal: R$ ${subtotal.toFixed(2)}\nDesconto: - R$ ${discount.toFixed(2)}` : null,
      `*VALOR TOTAL: R$ ${total.toFixed(2)}*`,
      `Forma de Pagamento: ${saleData.paymentMethod}`,
      `Troco: R$ ${saleData.changeAmount.toFixed(2)}`,
      `----------------------------------------`,
      `${STORE_CONFIG.policyNotice}`,
      `Agradecemos a sua preferência!`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      showToast('✓ Cupom copiado! Cole no WhatsApp ou envie ao cliente.', 'success');
    }).catch(() => {
      showToast('Texto copiado com sucesso!', 'success');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 select-none">
      <div className="bg-white rounded-2xl border border-[#c4c6ce]/60 shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="p-3.5 sm:p-4 bg-emerald-700 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-2xl text-emerald-200">check_circle</span>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>Venda Finalizada com Sucesso!</span>
                <span className="bg-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
                  Cupom Não Fiscal
                </span>
              </h3>
              <p className="text-[11px] text-emerald-100">
                Comprovante de Venda • Pedido {orderNum} • {timestamp}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/80 hover:text-white hover:bg-emerald-800/60 cursor-pointer transition-colors"
            title="Fechar Modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Feedback Toast Notification Banner */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all shrink-0 animate-in fade-in slide-in-from-top-1 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-100 text-emerald-900 border-b border-emerald-300'
                : 'bg-sky-100 text-sky-900 border-b border-sky-300'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">
                {feedbackMessage.type === 'success' ? 'check_circle' : 'info'}
              </span>
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-current opacity-70 hover:opacity-100 cursor-pointer ml-2"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* View Switcher Tabs & Quick Actions Bar */}
        <div className="p-2.5 bg-[#f0f3ff] border-b border-[#c4c6ce]/40 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-[#c4c6ce]/60 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('termica')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'termica'
                  ? 'bg-[#001229] text-white shadow-2xs'
                  : 'text-[#44474d] hover:text-[#001229]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">receipt_long</span>
              <span>Bobina Térmica (80mm)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fiscal')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'fiscal'
                  ? 'bg-[#001229] text-white shadow-2xs'
                  : 'text-[#44474d] hover:text-[#001229]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">description</span>
              <span>Resumo da Venda</span>
            </button>
          </div>

          <div className="text-[11px] text-[#00687a] font-mono font-bold">
            Total: R$ {total.toFixed(2)}
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#f4f6fb] flex justify-center">
          {activeTab === 'termica' ? (
            /* Realistic Thermal Paper Roll Simulation */
            <div className="w-full max-w-[360px] bg-white border border-[#c4c6ce] shadow-md p-4 rounded-sm text-[11px] font-mono text-[#001229] relative">
              {/* Paper zigzag top cut decoration */}
              <div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-repeat-x bg-[radial-gradient(circle,transparent_2px,#fff_2px)] bg-[length:6px_6px] pointer-events-none" />

              {/* Header Empresa */}
              <div className="text-center pb-2 border-b border-dashed border-[#888]">
                <div className="font-extrabold text-xs text-[#001229] tracking-tight">{STORE_CONFIG.name}</div>
                <div className="text-[10px] text-[#44474d] font-bold">CNPJ: {STORE_CONFIG.cnpj}</div>
                <div className="text-[9px] text-[#74777e] mt-0.5">{STORE_CONFIG.address}</div>
                <div className="text-[9px] text-[#74777e]">{STORE_CONFIG.neighborhood} - {STORE_CONFIG.city}/{STORE_CONFIG.state}</div>
                <div className="text-[9px] text-[#74777e]">Telefone: {STORE_CONFIG.phone}</div>
              </div>

              {/* Cupom Não Fiscal Subheader */}
              <div className="py-2 border-b border-dashed border-[#888] text-center">
                <div className="font-bold text-[11px]">*** CUPOM NÃO FISCAL ***</div>
                <div className="text-[9.5px]">NÃO É DOCUMENTO FISCAL</div>
                <div className="text-[8.5px] text-[#74777e]">COMPROVANTE DE VENDA A CONSUMIDOR</div>
                <div className="flex justify-between items-center text-[10px] mt-1 pt-1 border-t border-dotted border-[#aaa]">
                  <span>PEDIDO: {orderNum}</span>
                  <span>OPERADOR: {operator.split(' ')[0]}</span>
                </div>
                <div className="text-left text-[9.5px] text-[#44474d]">
                  Emissão: {timestamp}
                </div>
              </div>

              {/* Client Info */}
              <div className="py-2 border-b border-dashed border-[#888] space-y-0.5">
                <div className="font-bold text-[10px]">CONSUMIDOR:</div>
                <div className="text-[10px] truncate">{saleData.client.name}</div>
                <div className="flex justify-between text-[9px] text-[#74777e]">
                  <span>{saleData.client.docType}: {saleData.client.doc}</span>
                  <span>Convênio: Ativo</span>
                </div>
              </div>

              {/* Items List */}
              <div className="py-2 border-b border-dashed border-[#888]">
                <div className="font-bold text-[10px] flex justify-between pb-1 border-b border-dotted border-[#aaa] mb-1.5">
                  <span># CÓDIGO | DESCRIÇÃO</span>
                  <span>TOTAL</span>
                </div>
                <div className="space-y-2">
                  {items.map((item, index) => {
                    const itemTotal = (item.quantity * item.product.price).toFixed(2);
                    return (
                      <div key={item.product.id || index} className="space-y-0.5">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-[10px]">
                            {(index + 1).toString().padStart(3, '0')} {item.product.sku}
                          </span>
                          <span className="font-bold text-[10.5px]">R$ {itemTotal}</span>
                        </div>
                        <div className="text-[9.5px] text-[#333] leading-tight">
                          {item.product.name}
                        </div>
                        <div className="text-[9px] text-[#666] flex justify-between">
                          <span>{item.quantity} UN x R$ {item.product.price.toFixed(2)}</span>
                          <span>Unid: {item.product.stockUnit || 'un'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals & Payments */}
              <div className="py-2 border-b border-dashed border-[#888] space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span>Qtd. Total de Itens:</span>
                  <span>{totalItemsCount}</span>
                </div>
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-[10px] text-[#44474d]">
                      <span>Subtotal dos Produtos:</span>
                      <span>R$ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-emerald-800 font-semibold">
                      <span>Desconto Especial / Convênio:</span>
                      <span>- R$ {discount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-xs font-extrabold text-[#001229] pt-1 border-t border-dotted border-[#aaa]">
                  <span>VALOR A PAGAR R$:</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-[#001229] pt-1">
                  <span>FORMA PGTO:</span>
                  <span>{saleData.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-[9.5px]">
                  <span>Valor Recebido:</span>
                  <span>R$ {saleData.receivedAmount.toFixed(2)}</span>
                </div>
                {saleData.changeAmount > 0 && (
                  <div className="flex justify-between text-[9.5px] font-bold text-emerald-700">
                    <span>Troco:</span>
                    <span>R$ {saleData.changeAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Non-Fiscal Policy & Footer */}
              <div className="py-2 border-b border-dashed border-[#888] text-center text-[8.5px] text-[#74777e]">
                {STORE_CONFIG.policyNotice}
              </div>

              <div className="pt-2 text-center flex flex-col items-center justify-center space-y-1">
                <div className="text-[9px] text-[#74777e]">
                  Operador: {operator}
                </div>
                <div className="text-[8.5px] font-bold text-[#001229]">
                  {STORE_CONFIG.name} • VOLTE SEMPRE!
                </div>
                <div className="text-[8px] text-[#74777e]">
                  Controle Interno: {orderNum}
                </div>
              </div>

              {/* Paper zigzag bottom cut decoration */}
              <div className="absolute -bottom-1.5 left-0 right-0 h-1.5 bg-repeat-x bg-[radial-gradient(circle,transparent_2px,#fff_2px)] bg-[length:6px_6px] pointer-events-none" />
            </div>
          ) : (
            /* Structured Overview */
            <div className="w-full bg-white rounded-xl border border-[#c4c6ce]/60 p-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#f0f3ff] border border-[#c4c6ce]/40 space-y-1">
                  <span className="text-[10px] text-[#74777e] font-bold uppercase">Documento</span>
                  <div className="font-bold text-[#001229] text-sm">Cupom Não Fiscal</div>
                  <div className="text-[11px] text-[#44474d]">Pedido nº {orderNum}</div>
                </div>

                <div className="p-3 rounded-lg bg-[#f0f3ff] border border-[#c4c6ce]/40 space-y-1">
                  <span className="text-[10px] text-[#74777e] font-bold uppercase">Forma de Pagamento</span>
                  <div className="font-bold text-emerald-800 text-sm">{saleData.paymentMethod}</div>
                  <div className="text-[11px] text-[#44474d]">Total: R$ {total.toFixed(2)}</div>
                </div>
              </div>

              <div className="border border-[#c4c6ce]/40 rounded-lg overflow-hidden">
                <div className="bg-[#e7eeff] px-3 py-2 font-bold text-[#001229] text-[11px] flex justify-between">
                  <span>Itens Vendidos ({items.length})</span>
                  <span>Qtd. Total: {totalItemsCount}</span>
                </div>
                <div className="divide-y divide-[#c4c6ce]/30 max-h-48 overflow-y-auto">
                  {items.map((it, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-[#001229]">{it.product.name}</p>
                        <p className="text-[10px] text-[#74777e] font-mono">
                          SKU: {it.product.sku} • {it.quantity} un x R$ {it.product.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="font-mono font-bold text-[#001229]">
                        R$ {(it.quantity * it.product.price).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-base">verified</span>
                  <span>Venda Finalizada com Sucesso</span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  {STORE_CONFIG.fullAddress}
                </p>
                <p className="text-[11px] text-emerald-800">
                  CNPJ: {STORE_CONFIG.cnpj} • Telefone: {STORE_CONFIG.phone}
                </p>
                <p className="text-[10px] text-emerald-700 font-mono">
                  {STORE_CONFIG.policyNotice}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: Print, PDF, WhatsApp & Dismiss */}
        <div className="p-3.5 bg-white border-t border-[#c4c6ce]/50 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Real Thermal Printer Trigger */}
            <button
              type="button"
              onClick={handlePrintThermal}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-lg bg-[#001229] hover:bg-[#0f2744] active:scale-95 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Imprimir direto na bobina térmica de 80mm ou enviar para impressora"
            >
              <span className="material-symbols-outlined text-base">print</span>
              <span>Imprimir Térmica (80mm)</span>
            </button>

            {/* Direct Vector PDF Generation & Download */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-lg bg-[#e7eeff] hover:bg-[#dee8ff] active:scale-95 text-[#001229] font-bold text-xs border border-[#c4c6ce]/60 shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Gerar e salvar arquivo .pdf do cupom fiscal da venda"
            >
              <span className="material-symbols-outlined text-base text-[#00687a]">picture_as_pdf</span>
              <span>Baixar em PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Copy ticket to WhatsApp */}
            <button
              type="button"
              onClick={handleCopyReceiptText}
              className="flex-1 sm:flex-none px-3 py-2.5 rounded-lg border border-[#c4c6ce]/80 text-[#44474d] hover:text-[#001229] hover:bg-[#f0f3ff] text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1"
              title="Copiar texto estruturado do cupom fiscal para WhatsApp"
            >
              <span className="material-symbols-outlined text-base text-emerald-600">content_copy</span>
              <span>Copiar p/ WhatsApp</span>
            </button>

            {/* Close / New Sale */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1"
              title="Concluir venda e voltar ao caixa"
            >
              <span>Concluir</span>
              <span className="text-[10px] opacity-80">[Enter]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
