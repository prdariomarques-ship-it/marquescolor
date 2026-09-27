import React, { useState } from 'react';
import { Client } from '../types';

interface ClientesViewProps {
  clients: Client[];
  onSelectClientForPDV: (client: Client) => void;
  onOpenNewClientModal: () => void;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  clients,
  onSelectClientForPDV,
  onOpenNewClientModal,
}) => {
  const [selectedClient, setSelectedClient] = useState<Client>(clients[0]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'liberado' | 'atencao' | 'bloqueado' | 'pintor'>('all');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [overrideApproved, setOverrideApproved] = useState(false);

  const filteredClients = clients.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.doc.includes(searchFilter) ||
      c.code.toLowerCase().includes(searchFilter.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'pintor') return c.segment.toLowerCase().includes('pintor');
    return c.status === statusFilter;
  });

  const handleApproveLimit = () => {
    if (!supervisorPassword) {
      alert('Digite a senha de supervisor para autorizar a liberação de crédito excepcional.');
      return;
    }
    setOverrideApproved(true);
    alert(`Limite excepcional de R$ 15.000,00 aprovado para ${selectedClient.name} sob chancela de gerência.`);
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-xl border border-[#c4c6ce]/30 bg-white select-none">
      {/* LEFT / CENTER WORKSTATION (Flexible canvas) */}
      <section className="flex-1 flex flex-col min-w-0 overflow-y-auto p-5 border-r border-[#c4c6ce]/30">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#c4c6ce]/30">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-bold text-[#001229] tracking-tight">
                Base de Clientes & Faturamento a Prazo
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#00687a]/10 text-[#00687a] border border-[#00687a]/20">
                Convênio Corporativo
              </span>
            </div>
            <p className="text-xs text-[#44474d] mt-0.5">
              Gestão de limites de crédito, prazos de pagamento faturado (30/60/90 dias), convênios de pintores profissionais e análise de risco cadastral.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => alert('Relatório de análise de crédito Serasa/SPC gerado para 142 clientes ativos.')}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#c4c6ce]/60 text-[#001229] text-xs font-semibold hover:bg-[#f0f3ff] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm text-[#00687a]">description</span>
              <span>Exportar Serasa/SPC</span>
            </button>

            <button
              onClick={() => alert('Lote de 28 boletos bancários emitidos para envio via DDA/Email.')}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#c4c6ce]/60 text-[#001229] text-xs font-semibold hover:bg-[#f0f3ff] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm text-[#00687a]">receipt</span>
              <span>Lote de Boletos</span>
            </button>

            <button
              onClick={onOpenNewClientModal}
              className="px-3.5 py-1.5 rounded-lg bg-[#0f2744] text-white text-xs font-bold hover:bg-[#001229] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm text-[#57dffe]">person_add</span>
              <span>+ Novo Cliente [F3]</span>
            </button>
          </div>
        </div>

        {/* KPI Metrics Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 my-4">
          {/* KPI 1: Carteira Faturada Ativa */}
          <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#c4c6ce]/40 relative overflow-hidden">
            <div className="flex items-center justify-between text-[#44474d] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e]">
                Carteira Faturada Ativa
              </span>
              <span className="w-7 h-7 rounded-lg bg-[#00687a]/10 flex items-center justify-center text-[#00687a]">
                <span className="material-symbols-outlined text-base">account_balance_wallet</span>
              </span>
            </div>
            <div className="text-[20px] font-bold text-[#001229] font-mono">
              R$ 428.650,00
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-[#44474d]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#00687a]"></span>
              <span>142 empresas/pintores c/ fatura</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00687a]"></div>
          </div>

          {/* KPI 2: Limite Concedido Total */}
          <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#c4c6ce]/40 relative overflow-hidden">
            <div className="flex items-center justify-between text-[#44474d] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e]">
                Limite Concedido Total
              </span>
              <span className="w-7 h-7 rounded-lg bg-[#001229]/10 flex items-center justify-center text-[#001229]">
                <span className="material-symbols-outlined text-base">credit_score</span>
              </span>
            </div>
            <div className="text-[20px] font-bold text-[#001229] font-mono">
              R$ 850.000,00
            </div>
            <div className="mt-1">
              <div className="flex items-center justify-between text-[11px] text-[#44474d] mb-0.5">
                <span>Utilização da Carteira</span>
                <span className="font-bold text-[#001229]">50,4%</span>
              </div>
              <div className="w-full h-1.5 bg-[#dee8ff] rounded-full overflow-hidden">
                <div className="h-full bg-[#001229] rounded-full" style={{ width: '50.4%' }}></div>
              </div>
            </div>
          </div>

          {/* KPI 3: Títulos a Vencer (7 dias) */}
          <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#c4c6ce]/40 relative overflow-hidden">
            <div className="flex items-center justify-between text-[#44474d] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e]">
                Títulos a Vencer (7 dias)
              </span>
              <span className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800">
                <span className="material-symbols-outlined text-base">event_upcoming</span>
              </span>
            </div>
            <div className="text-[20px] font-bold text-[#001229] font-mono">
              R$ 64.200,00
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-800 font-semibold">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>18 duplicatas a liquidar</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>
          </div>

          {/* KPI 4: Inadimplência */}
          <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#c4c6ce]/40 relative overflow-hidden">
            <div className="flex items-center justify-between text-[#44474d] mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e]">
                Inadimplência
              </span>
              <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                <span className="material-symbols-outlined text-base">verified_user</span>
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-bold text-emerald-700 font-mono">1.8%</span>
              <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Índice Saudável
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-[#44474d]">
              <span className="material-symbols-outlined text-emerald-600 text-sm">trending_down</span>
              <span>-0.4% vs. mês anterior</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500"></div>
          </div>
        </div>

        {/* Filters & Smart Search Control Bar */}
        <div className="bg-[#f0f3ff] p-3 rounded-xl border border-[#c4c6ce]/40 mb-3 flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
              <span className="material-symbols-outlined text-base">search</span>
            </span>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por CNPJ, CPF, Razão Social, Telefone ou Matrícula..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-[#c4c6ce]/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00687a]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <div className="flex bg-white p-0.5 rounded-lg border border-[#c4c6ce]/40 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === 'all' ? 'bg-[#001229] text-white font-bold' : 'text-[#44474d]'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter('liberado')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === 'liberado' ? 'bg-[#001229] text-white font-bold' : 'text-[#44474d]'
                }`}
              >
                Crédito Aprovado
              </button>
              <button
                onClick={() => setStatusFilter('atencao')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === 'atencao' ? 'bg-[#001229] text-white font-bold' : 'text-[#44474d]'
                }`}
              >
                Atenção
              </button>
              <button
                onClick={() => setStatusFilter('bloqueado')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === 'bloqueado' ? 'bg-[#001229] text-white font-bold' : 'text-[#44474d]'
                }`}
              >
                Bloqueado
              </button>
              <button
                onClick={() => setStatusFilter('pintor')}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  statusFilter === 'pintor' ? 'bg-[#001229] text-white font-bold' : 'text-[#44474d]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Pintor Pro</span>
              </button>
            </div>
          </div>
        </div>

        {/* High-Density Customers & Credit Table */}
        <div className="bg-white rounded-xl border border-[#c4c6ce]/40 shadow-xs overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f0f3ff]/70 border-b border-[#c4c6ce]/40 text-[11px] uppercase tracking-wider text-[#74777e] sticky top-0 z-10">
                  <th className="py-2.5 px-4 font-bold">Cliente / Razão Social</th>
                  <th className="py-2.5 px-4 font-bold">Limite Total & Disponível</th>
                  <th className="py-2.5 px-4 font-bold">Prazo Padrão</th>
                  <th className="py-2.5 px-4 text-right font-bold">Títulos Abertos</th>
                  <th className="py-2.5 px-4 text-center font-bold">Pontualidade</th>
                  <th className="py-2.5 px-4 text-center font-bold">Status Financeiro</th>
                  <th className="py-2.5 px-4 text-center font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c4c6ce]/20">
                {filteredClients.map((c) => {
                  const isSelected = selectedClient.id === c.id;
                  const available = c.creditLimit - c.creditUsed;
                  const pct = Math.min(100, Math.round((c.creditUsed / c.creditLimit) * 100));

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedClient(c)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#dee8ff]/50 border-l-4 border-[#00687a]'
                          : 'hover:bg-[#f0f3ff]/60'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#0f2744] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>
                          <div>
                            <div className="font-bold text-[#001229] flex items-center gap-1.5">
                              <span>{c.name}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#00687a]/15 text-[#00687a] border border-[#00687a]/25">
                                {c.segment}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#44474d] font-mono flex items-center gap-2 mt-0.5">
                              <span>{c.docType}: {c.doc}</span>
                              <span>•</span>
                              <span>Cod: {c.code}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="w-44">
                          <div className="flex justify-between text-[11px] font-mono mb-1">
                            <span className="text-[#44474d]">
                              Disp: <b className="text-emerald-700">R$ {available.toLocaleString('pt-BR')}</b>
                            </span>
                            <span className="text-[#74777e]">Tot: {c.creditLimit.toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="w-full h-1.5 bg-[#dee8ff] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                pct > 90 ? 'bg-[#ba1a1a]' : pct > 75 ? 'bg-amber-500' : 'bg-[#00687a]'
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="text-[10px] text-[#44474d] mt-0.5">{pct}% tomado</div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-[#f0f3ff] text-[#001229] font-medium border border-[#c4c6ce]/30">
                          {c.paymentTerm}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-[#001229]">
                          R$ {c.openAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-[#44474d]">{c.openInvoices} duplicatas</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {c.score}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {c.status === 'liberado' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Liberado p/ Faturar
                          </span>
                        )}
                        {c.status === 'atencao' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Atenção Limite 85%
                          </span>
                        )}
                        {c.status === 'bloqueado' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-[#ba1a1a] border border-red-300 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]"></span>
                            Bloqueado por Atraso
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectClientForPDV(c);
                            }}
                            className="p-1.5 rounded hover:bg-[#dee8ff] text-[#001229] cursor-pointer"
                            title="Faturar no Balcão PDV"
                          >
                            <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              alert(`Extrato financeiro emitido para ${c.name}.`);
                            }}
                            className="p-1.5 rounded hover:bg-[#dee8ff] text-[#44474d] cursor-pointer"
                            title="Extrato Financeiro"
                          >
                            <span className="material-symbols-outlined text-base">receipt_long</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-2.5 bg-[#f0f3ff]/40 border-t border-[#c4c6ce]/30 flex items-center justify-between text-xs text-[#44474d]">
            <span>Mostrando <b>1 - {filteredClients.length}</b> de <b>142</b> clientes corporativos</span>
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded bg-[#001229] text-white font-bold">1</span>
              <button className="px-2 py-0.5 rounded hover:bg-[#dee8ff]">2</button>
              <button className="px-2 py-0.5 rounded hover:bg-[#dee8ff]">3</button>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SPLIT DRAWER: DETAIL PANEL FOR SELECTED CLIENT */}
      <aside className="w-[420px] shrink-0 bg-white flex flex-col h-full shadow-lg border-l border-[#c4c6ce]/40 overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#c4c6ce]/30 bg-[#f0f3ff]/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#0f2744] text-white flex items-center justify-center font-bold text-base shadow-xs">
                {selectedClient.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-[#00687a]/15 text-[#00687a] border border-[#00687a]/25 uppercase tracking-wide">
                  Cliente Selecionado
                </span>
                <h2 className="text-sm font-bold text-[#001229] mt-0.5 line-clamp-1">
                  {selectedClient.name}
                </h2>
                <span className="text-[11px] text-[#44474d]">
                  Inscrição Estadual: 114.908.231.110
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="p-4 space-y-4 flex-1 text-xs">
          {/* Credit Health Dashboard Widget */}
          <div className="p-4 rounded-xl bg-[#001229] text-white space-y-3 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#798fb1] tracking-wider uppercase">
                Raio-X de Crédito Corporativo
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Convênio Master
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] text-[#798fb1] block">Limite Total</span>
                <span className="font-bold font-mono text-xs">
                  R$ {selectedClient.creditLimit.toLocaleString('pt-BR')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#798fb1] block">Utilizado</span>
                <span className="font-bold text-amber-300 font-mono text-xs">
                  R$ {selectedClient.creditUsed.toLocaleString('pt-BR')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#798fb1] block">Disponível</span>
                <span className="font-bold text-emerald-400 font-mono text-xs">
                  R$ {(selectedClient.creditLimit - selectedClient.creditUsed).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[#798fb1] mb-1">
                <span>Comprometimento de Margem</span>
                <span className="font-bold text-white">
                  {Math.round((selectedClient.creditUsed / selectedClient.creditLimit) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#57dffe] rounded-full"
                  style={{ width: `${Math.min(100, Math.round((selectedClient.creditUsed / selectedClient.creditLimit) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Fiscal & Contact Details Card */}
          <div className="p-3 rounded-lg border border-[#c4c6ce]/40 bg-[#f0f3ff]/20 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e] block">
              Canais Fiscais & Financeiros
            </span>
            <div className="flex items-center justify-between py-1 border-b border-[#c4c6ce]/20">
              <span className="text-[#44474d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#74777e]">mail</span>
                E-mail NF-e / Boletos:
              </span>
              <span className="font-mono font-bold text-[#001229] truncate max-w-[180px]">
                {selectedClient.email}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-[#c4c6ce]/20">
              <span className="text-[#44474d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#74777e]">phone</span>
                Telefone / WhatsApp:
              </span>
              <span className="font-mono text-[#001229] font-bold">
                {selectedClient.phone}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-[#44474d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#74777e]">qr_code</span>
                Chave PIX Cadastrada:
              </span>
              <span className="font-mono text-[#001229] font-bold">
                {selectedClient.pixKey}
              </span>
            </div>
          </div>

          {/* Last Orders & Pending Invoices */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#74777e]">
                Duplicatas em Aberto ({selectedClient.duplicatas.length})
              </span>
              <span
                onClick={() => alert(`Histórico de faturas completo exportado para ${selectedClient.name}.`)}
                className="text-[11px] text-[#00687a] cursor-pointer hover:underline font-semibold"
              >
                Ver Histórico Completo
              </span>
            </div>

            <div className="space-y-2">
              {selectedClient.duplicatas.map((dup) => (
                <div
                  key={dup.id}
                  className="p-2.5 rounded-lg border border-[#c4c6ce]/40 bg-white hover:border-[#00687a]/50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#001229] font-mono">{dup.id}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        dup.daysDue < 0
                          ? 'bg-red-100 text-[#ba1a1a]'
                          : dup.daysDue <= 7
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-[#dee8ff] text-[#001229]'
                      }`}>
                        {dup.daysDue < 0
                          ? `Vencido há ${Math.abs(dup.daysDue)} dias`
                          : `Vence em ${dup.daysDue} dias`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#44474d] mt-0.5">
                      Pedido {dup.orderNum} • {dup.description}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-[#001229] font-mono block">
                      R$ {dup.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => alert(`Gerando 2ª via do boleto ${dup.id} em PDF com código de barras Febraban.`)}
                      className="text-[11px] text-[#00687a] hover:underline flex items-center gap-0.5 justify-end font-semibold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
                      <span>2ª Via Boleto</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supervisor Override / Special Authorization Box */}
          <div className="p-3.5 rounded-xl border border-[#00687a]/30 bg-[#f0f3ff]/50 space-y-2.5">
            <div className="flex items-center gap-2 text-[#001229] font-bold">
              <span className="material-symbols-outlined text-[#00687a] text-lg">admin_panel_settings</span>
              <span>Autorizar Venda Especial Faturada</span>
            </div>
            <p className="text-[11px] text-[#44474d]">
              Libere faturamento pontual acima da margem disponível mediante validação de alçada de gerência.
            </p>
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
                  <span className="material-symbols-outlined text-base">lock</span>
                </span>
                <input
                  type="password"
                  value={supervisorPassword}
                  onChange={(e) => setSupervisorPassword(e.target.value)}
                  placeholder="Senha supervisor / token biométrico..."
                  className="w-full h-8 pl-9 pr-3 text-xs bg-white border border-[#c4c6ce]/50 rounded-lg focus:outline-none focus:border-[#00687a]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleApproveLimit}
                  className="flex-1 py-1.5 rounded bg-[#001229] text-white text-xs font-bold hover:bg-[#0f2744] transition-colors cursor-pointer"
                >
                  {overrideApproved ? 'Limite Aprovado ✓' : 'Aprovar Limite Excepcional'}
                </button>
                <button
                  onClick={() => alert('Histórico de liberações de crédito: 2 aprovações nos últimos 30 dias.')}
                  className="px-3 py-1.5 rounded bg-[#dee8ff] text-[#001229] text-xs font-bold hover:bg-[#c4c6ce] transition-colors cursor-pointer"
                >
                  Histórico
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Bottom Action Anchor */}
        <div className="p-3 border-t border-[#c4c6ce]/30 bg-white flex items-center gap-2">
          <button
            onClick={() => onSelectClientForPDV(selectedClient)}
            className="flex-1 py-2 rounded-lg bg-[#00687a] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#004e5c] transition-all shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">point_of_sale</span>
            <span>Faturar Pedido no Balcão [F3]</span>
          </button>

          <button
            onClick={() => alert(`Imprimindo ficha cadastral corporativa de ${selectedClient.name}.`)}
            className="p-2 rounded-lg border border-[#c4c6ce]/50 text-[#001229] hover:bg-[#f0f3ff] transition-colors cursor-pointer"
            title="Imprimir Ficha Cadastral"
          >
            <span className="material-symbols-outlined text-lg">print</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
