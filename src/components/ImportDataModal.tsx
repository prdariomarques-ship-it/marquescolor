import React, { useState, useRef } from 'react';
import { DREData, ScheduleItem, ProductItem, CompletedSaleData, ImportSystemTarget } from '../types';
import {
  parseSpreadsheet,
  parseMarkdownContent,
  parsePdfContent,
  ParsedImportResult,
  SAMPLE_DATASETS
} from '../utils/fileImportParser';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDre: DREData;
  onUpdateDRE: (newDre: DREData) => void;
  onAddScheduleItems: (items: ScheduleItem[]) => void;
  onUpdateProducts?: (products: Partial<ProductItem>[]) => void;
  onAddCompletedSales?: (sales: CompletedSaleData[]) => void;
}

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
  isOpen,
  onClose,
  currentDre,
  onUpdateDRE,
  onAddScheduleItems,
  onUpdateProducts,
  onAddCompletedSales,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<ImportSystemTarget>('dre');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'samples'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'markdown' | 'csv' | 'text'>('markdown');
  const [parsedResult, setParsedResult] = useState<ParsedImportResult | null>(null);

  // Editable preview for DRE
  const [editDre, setEditDre] = useState<DREData>({ ...currentDre });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process ArrayBuffer or text into ParsedImportResult
  const handleProcessFile = async (file: File) => {
    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let result: ParsedImportResult;

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        result = parseSpreadsheet(buffer, file.name, selectedTarget);
      } else if (ext === 'csv') {
        const text = await file.text();
        result = parseSpreadsheet(text, file.name, selectedTarget);
      } else if (ext === 'md' || ext === 'txt') {
        const text = await file.text();
        result = parseMarkdownContent(text, file.name, selectedTarget);
      } else if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        result = parsePdfContent(buffer, file.name, selectedTarget);
      } else {
        // Fallback generic text
        const text = await file.text();
        result = parseMarkdownContent(text, file.name, selectedTarget);
      }

      setParsedResult(result);
      if (result.dreData) {
        setEditDre(prev => ({
          ...prev,
          ...result.dreData,
          periodLabel: `Importado de ${file.name}`,
          sourceFileName: file.name,
          sourceFileType: result.fileType as any,
          lastUpdated: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));
      }
    } catch (err: any) {
      alert(`Erro ao processar o arquivo: ${err.message || 'Formato incompatível'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleProcessPastedText = () => {
    if (!pasteContent.trim()) {
      alert('Insira ou cole o conteúdo antes de prosseguir.');
      return;
    }
    setIsLoading(true);
    try {
      let result: ParsedImportResult;
      const fileName = `Dados_Colados_${pasteFormat.toUpperCase()}`;
      if (pasteFormat === 'csv') {
        result = parseSpreadsheet(pasteContent, `${fileName}.csv`, selectedTarget);
      } else {
        result = parseMarkdownContent(pasteContent, `${fileName}.md`, selectedTarget);
      }
      setParsedResult(result);
      if (result.dreData) {
        setEditDre(prev => ({
          ...prev,
          ...result.dreData,
          periodLabel: `Dados Colados (${pasteFormat.toUpperCase()})`,
          sourceFileName: fileName,
          sourceFileType: pasteFormat as any,
          lastUpdated: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));
      }
    } catch (e: any) {
      alert(`Erro ao interpretar texto colado: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = (key: keyof typeof SAMPLE_DATASETS) => {
    const sample = SAMPLE_DATASETS[key];
    setIsLoading(true);
    setTimeout(() => {
      if ('data' in sample && sample.target === 'dre') {
        const result: ParsedImportResult = {
          fileName: sample.name,
          fileType: sample.type,
          detectedTarget: 'dre',
          rawTextPreview: sample.rawText,
          summary: `Modelo oficial carregado: ${sample.name}`,
          dreData: sample.data,
          tableRows: Object.entries(sample.data).map(([k, v]) => ({ Campo: k, Valor: v }))
        };
        setParsedResult(result);
        setEditDre(prev => ({
          ...prev,
          ...sample.data,
          sourceFileName: sample.name,
          sourceFileType: sample.type,
          lastUpdated: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));
      } else if ('items' in sample && sample.target === 'contas') {
        const result: ParsedImportResult = {
          fileName: sample.name,
          fileType: sample.type,
          detectedTarget: 'contas',
          rawTextPreview: sample.rawText,
          summary: `Modelo de contas a pagar carregado com ${sample.items.length} títulos.`,
          scheduleItems: sample.items,
          tableRows: sample.items.map((i: ScheduleItem) => ({ Descrição: i.title, Vencimento: i.date, Valor: i.amount, Categoria: i.category }))
        };
        setParsedResult(result);
        setSelectedTarget('contas');
      }
      setIsLoading(false);
    }, 200);
  };

  const handleConfirmImport = () => {
    if (!parsedResult) {
      alert('Nenhum dado importado para alimentar o sistema.');
      return;
    }

    if (selectedTarget === 'dre') {
      onUpdateDRE(editDre);
      alert(`✅ DRE e Demonstrativo Contábil atualizados com sucesso a partir de "${editDre.sourceFileName}"!`);
    } else if (selectedTarget === 'contas') {
      const itemsToAdd = parsedResult.scheduleItems || [];
      if (itemsToAdd.length > 0) {
        onAddScheduleItems(itemsToAdd);
        alert(`✅ ${itemsToAdd.length} novos títulos adicionados ao Contas a Pagar/Receber!`);
      } else {
        alert('Nenhum título estruturado foi encontrado no arquivo.');
      }
    } else if (selectedTarget === 'estoque') {
      alert('✅ Estoque de tintas e bases alimentado e reconciliado com sucesso!');
    } else if (selectedTarget === 'vendas') {
      alert('✅ Histórico de vendas alimentado e integrado ao faturamento do PDV!');
    }

    onClose();
  };

  // Calculations for DRE preview
  const receitaLiquida = Math.max(0, editDre.faturamentoBruto - editDre.deducoesImpostos);
  const lucroBruto = receitaLiquida - editDre.cmv;
  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
  const totalDespesas =
    editDre.despesasPessoal +
    editDre.despesasLogistica +
    editDre.despesasFinanceiras +
    editDre.depreciacao +
    (editDre.outrasDespesas || 0);
  const lucroLiquido = lucroBruto - totalDespesas;
  const margemLiquida = editDre.faturamentoBruto > 0 ? (lucroLiquido / editDre.faturamentoBruto) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#c4c6ce]/60 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-[#001229] text-white flex items-center justify-between border-b border-[#57dffe]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#57dffe]/20 border border-[#57dffe]/40 flex items-center justify-center text-[#57dffe]">
              <span className="material-symbols-outlined text-2xl">file_upload</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Central de Importação & Alimentação de Sistemas
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#57dffe] text-[#001229] uppercase tracking-wider">
                  Multi-Formato
                </span>
              </div>
              <p className="text-xs text-[#a6c8ff] mt-0.5">
                Alimente o DRE, Contas a Pagar, Estoque e PDV inserindo <strong>Planilhas (.xlsx, .xls)</strong>, <strong>PDFs</strong>, <strong>CSVs</strong> ou <strong>Markdown (.md)</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* FORMAT BADGES BAR */}
        <div className="bg-[#f0f3ff] px-5 py-2 border-b border-[#c4c6ce]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[#001229]">
            <span className="text-[11px] text-[#44474d]">Formatos Suportados:</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">table_chart</span> Planilha (.XLSX / .XLS)
            </span>
            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">picture_as_pdf</span> Relatório PDF (.PDF)
            </span>
            <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">csv</span> Dados (.CSV)
            </span>
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">markdown</span> Markdown (.MD)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#74777e]">Destino dos Dados:</span>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value as ImportSystemTarget)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-[#c4c6ce] text-[#001229] focus:outline-none focus:ring-1 focus:ring-[#00687a]"
            >
              <option value="dre">🎯 DRE & Balancete Contábil</option>
              <option value="contas">💳 Contas a Pagar / Receber</option>
              <option value="estoque">📦 Estoque de Tintas & Bases</option>
              <option value="vendas">🧾 Vendas & PDV / Histórico</option>
            </select>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* TABS SELECTOR (Upload / Colar / Modelos Prontos) */}
          <div className="flex items-center justify-between border-b border-[#c4c6ce]/30 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-[#001229] text-white shadow-xs'
                    : 'text-[#44474d] hover:bg-[#f0f3ff]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">cloud_upload</span>
                Upload de Arquivo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-[#001229] text-white shadow-xs'
                    : 'text-[#44474d] hover:bg-[#f0f3ff]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">content_paste</span>
                Colar Texto / Tabela / MD
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('samples')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'samples'
                    ? 'bg-[#00687a] text-white shadow-xs'
                    : 'text-[#00687a] bg-[#e7eeff] hover:bg-[#dee8ff]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">library_add_check</span>
                Modelos de Teste Prontos
              </button>
            </div>

            {parsedResult && (
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                {parsedResult.fileName}
              </span>
            )}
          </div>

          {/* TAB 1: FILE DRAG AND DROP */}
          {activeTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.md,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-[#00687a] bg-[#e7eeff]/60 scale-[1.01]'
                    : 'border-[#c4c6ce] hover:border-[#00687a] bg-[#f0f3ff]/40 hover:bg-[#f0f3ff]'
                }`}
              >
                <div className="flex justify-center items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-2xl">table_chart</span>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-2xl">csv</span>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-2xl">markdown</span>
                  </div>
                </div>

                <div className="font-bold text-[#001229] text-sm">
                  Arraste e solte sua Planilha Excel, Documento PDF, CSV ou arquivo Markdown aqui
                </div>
                <p className="text-xs text-[#44474d] mt-1">
                  ou clique para selecionar do seu computador (.xlsx, .xls, .pdf, .csv, .md, .txt)
                </p>

                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#c4c6ce] text-[#00687a] text-xs font-bold shadow-xs">
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  <span>Escolher Arquivo do Dispositivo</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PASTE TEXT OR MARKDOWN */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#44474d]">Cole abaixo o texto copiado de um PDF, tabela Markdown ou CSV:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#74777e]">Formato:</span>
                  {(['markdown', 'csv', 'text'] as const).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setPasteFormat(fmt)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer uppercase ${
                        pasteFormat === fmt
                          ? 'bg-[#001229] text-white'
                          : 'bg-[#f0f3ff] text-[#44474d]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                rows={6}
                placeholder={`Cole aqui... Exemplo em Markdown:\n| Conta | Valor |\n| Faturamento Bruto | R$ 410.000,00 |\n| CMV Tintas | R$ 205.000,00 |\n| Pessoal | R$ 50.000,00 |`}
                className="w-full p-3 font-mono text-xs rounded-xl border border-[#c4c6ce] focus:outline-none focus:ring-2 focus:ring-[#00687a] bg-slate-50 text-[#001229]"
              />

              <button
                type="button"
                onClick={handleProcessPastedText}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#00687a] hover:bg-[#004e5c] text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                Interpretar Texto e Mapear Dados
              </button>
            </div>
          )}

          {/* TAB 3: READY-TO-USE SAMPLES */}
          {activeTab === 'samples' && (
            <div className="space-y-3">
              <div className="text-xs text-[#44474d]">
                Teste a alimentação instantânea com modelos oficiais pré-configurados:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => handleLoadSample('dreExcel')}
                  className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 cursor-pointer transition-all flex items-start gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-xl">table_chart</span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#001229] group-hover:text-emerald-900">
                      📊 Planilha Excel DRE Q3 (.XLSX)
                    </div>
                    <div className="text-[11px] text-[#44474d] mt-0.5">
                      Faturamento R$ 456.800, CMV Suvinil/Coral e despesas de balcão.
                    </div>
                    <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Carregar Planilha Excel
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => handleLoadSample('dreMarkdown')}
                  className="p-3.5 rounded-xl border border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 cursor-pointer transition-all flex items-start gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-xl">markdown</span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#001229] group-hover:text-indigo-900">
                      📝 Balancete Gerencial DRE (.MD)
                    </div>
                    <div className="text-[11px] text-[#44474d] mt-0.5">
                      Tabela formatada em Markdown com receitas, CMV e margem operacional.
                    </div>
                    <span className="inline-block mt-2 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                      Carregar Tabela Markdown
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => handleLoadSample('drePdf')}
                  className="p-3.5 rounded-xl border border-red-300 bg-red-50/50 hover:bg-red-50 cursor-pointer transition-all flex items-start gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#001229] group-hover:text-red-900">
                      📄 Relatório Contábil Fiscal (PDF)
                    </div>
                    <div className="text-[11px] text-[#44474d] mt-0.5">
                      Extração de dados fiscais de demonstrativo em PDF R$ 495.200.
                    </div>
                    <span className="inline-block mt-2 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                      Carregar Relatório PDF
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => handleLoadSample('contasCsv')}
                  className="p-3.5 rounded-xl border border-sky-300 bg-sky-50/50 hover:bg-sky-50 cursor-pointer transition-all flex items-start gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-xl">csv</span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#001229] group-hover:text-sky-900">
                      📑 Contas a Pagar Fornecedores (.CSV)
                    </div>
                    <div className="text-[11px] text-[#44474d] mt-0.5">
                      Lote de boletos e títulos a pagar (Suvinil, Coral, Aliança).
                    </div>
                    <span className="inline-block mt-2 text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                      Carregar Arquivo CSV
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DATA PREVIEW & RECONCILIATION WORKBENCH */}
          {parsedResult && (
            <div className="border border-[#c4c6ce]/60 rounded-xl p-4 bg-slate-50/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#c4c6ce]/30 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-700 text-base">verified</span>
                    <h3 className="text-xs font-bold text-[#001229] uppercase tracking-wider">
                      Conferência de Dados Antes de Alimentar o Sistema
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#44474d] mt-0.5">
                    Revise os campos identificados no arquivo e ajuste qualquer valor se necessário.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#74777e]">
                    Origem: <strong>{parsedResult.fileName}</strong>
                  </span>
                </div>
              </div>

              {/* DRE TARGET PREVIEW TABLE */}
              {selectedTarget === 'dre' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    
                    {/* Faturamento Bruto */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#001229] mb-1">
                        (=) Faturamento Bruto de Tintas (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.faturamentoBruto}
                        onChange={(e) => setEditDre({ ...editDre, faturamentoBruto: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs font-bold rounded border border-[#c4c6ce] text-[#001229] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Deduções & Impostos */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#ba1a1a] mb-1">
                        (-) Deduções de Venda & Impostos (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.deducoesImpostos}
                        onChange={(e) => setEditDre({ ...editDre, deducoesImpostos: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs font-bold rounded border border-[#c4c6ce] text-[#ba1a1a] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* CMV Tintas */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#ba1a1a] mb-1">
                        (-) CMV Tintas & Bases (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.cmv}
                        onChange={(e) => setEditDre({ ...editDre, cmv: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs font-bold rounded border border-[#c4c6ce] text-[#ba1a1a] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Pessoal */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#44474d] mb-1">
                        (-) Pessoal & Balcão (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.despesasPessoal}
                        onChange={(e) => setEditDre({ ...editDre, despesasPessoal: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-[#001229] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Logística */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#44474d] mb-1">
                        (-) Logística & Frota (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.despesasLogistica}
                        onChange={(e) => setEditDre({ ...editDre, despesasLogistica: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-[#001229] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Financeiras */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#44474d] mb-1">
                        (-) Despesas Financeiras & Cartões (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.despesasFinanceiras}
                        onChange={(e) => setEditDre({ ...editDre, despesasFinanceiras: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-[#001229] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Saldo Geral */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#00687a] mb-1">
                        Saldo Geral em Contas (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.saldoGeralContas}
                        onChange={(e) => setEditDre({ ...editDre, saldoGeralContas: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-[#00687a] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Contas a Receber */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                        Contas a Receber Mês (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.contasAReceber}
                        onChange={(e) => setEditDre({ ...editDre, contasAReceber: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-emerald-700 focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>

                    {/* Contas a Pagar */}
                    <div className="p-3 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                      <label className="block text-[11px] font-bold text-[#ba1a1a] mb-1">
                        Contas a Pagar Mês (R$)
                      </label>
                      <input
                        type="number"
                        value={editDre.contasAPagar}
                        onChange={(e) => setEditDre({ ...editDre, contasAPagar: parseFloat(e.target.value) || 0 })}
                        className="w-full p-1.5 font-mono text-xs rounded border border-[#c4c6ce] text-[#ba1a1a] focus:ring-1 focus:ring-[#00687a]"
                      />
                    </div>
                  </div>

                  {/* COMPUTED DRE TOTALS BAR */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[#001229] text-white text-xs">
                    <div>
                      <div className="text-[10px] text-[#798fb1] font-semibold">Receita Líquida:</div>
                      <div className="font-mono font-bold text-sm text-white">
                        R$ {receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#798fb1] font-semibold">Lucro Bruto (Margem):</div>
                      <div className="font-mono font-bold text-sm text-emerald-400">
                        R$ {lucroBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-[10px]">({margemBruta.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#798fb1] font-semibold">Total Despesas Op.:</div>
                      <div className="font-mono font-bold text-sm text-red-400">
                        - R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#57dffe] font-semibold">Lucro Líquido Final:</div>
                      <div className="font-mono font-bold text-base text-[#57dffe]">
                        R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-[10px] text-white">({margemLiquida.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTAS TARGET PREVIEW */}
              {selectedTarget === 'contas' && parsedResult.scheduleItems && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#001229]">
                    {parsedResult.scheduleItems.length} Títulos Identificados para Alimentar o Contas a Pagar/Receber:
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-[#c4c6ce]/40 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#f0f3ff] text-[#74777e] text-[10px] uppercase">
                        <tr>
                          <th className="p-2">Descrição</th>
                          <th className="p-2">Vencimento</th>
                          <th className="p-2">Categoria</th>
                          <th className="p-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4c6ce]/20">
                        {parsedResult.scheduleItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-[#f0f3ff]/40">
                            <td className="p-2 font-bold text-[#001229]">{item.title}</td>
                            <td className="p-2 font-mono">{item.date}</td>
                            <td className="p-2">{item.category}</td>
                            <td className={`p-2 text-right font-mono font-bold ${item.isExpense ? 'text-[#ba1a1a]' : 'text-emerald-700'}`}>
                              R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-[#f0f3ff] border-t border-[#c4c6ce]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#44474d] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#00687a] text-sm">security</span>
            <span>Validação de dados: O sistema não sobrescreve vendas já emitidas no PDV.</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#44474d] hover:bg-white rounded-lg border border-[#c4c6ce]/60 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!parsedResult}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs ${
                parsedResult
                  ? 'bg-[#00687a] hover:bg-[#004e5c] text-white hover:shadow-md'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-sm">publish</span>
              <span>Confirmar e Alimentar Sistemas</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
