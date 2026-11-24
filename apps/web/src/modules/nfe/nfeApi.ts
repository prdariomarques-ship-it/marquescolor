// Cliente da API /api/nfe/* (contratos em docs/integrations/nfe-api.md).
import { api, request } from '../../lib/api';

export interface NfeItem {
  id: string; numeroItem: number; codigoFornecedor: string | null; descricao: string | null; ncm: string | null; cfop: string | null;
  unidade: string | null; quantidadeOriginal: string; quantidade: number; valorUnitarioOriginal: string; valorTotalCentavos: number;
  statusVinculo: string; vinculoOrigem: string | null; produtoId: string | null; quantidadeRecebida: number | null;
  produto?: { id: string; codigoInterno: string; nome: string; unidade: string; estoqueAtual: number } | null;
}
export interface NfeRevisao {
  id: string; entidadeTipo: string; entidadeId: string; motivo: string; severidade: 'BLOQUEANTE' | 'ALERTA'; detalhe: string | null;
  status: 'ABERTO' | 'RESOLVIDO' | 'DISPENSADO'; resolucao: string | null; documentoId: string | null;
}
export interface NfeDocumento {
  id: string; chaveAcesso: string | null; chaveValida: boolean; numero: string | null; serie: string | null; dataEmissao: string | null;
  emitenteNome: string | null; emitenteCnpj: string | null; fornecedorId: string | null; fornecedor?: { id: string; razaoSocial: string } | null;
  valorTotalCentavos: number; valorProdutosCentavos: number; valorFreteCentavos: number; valorDescontoCentavos: number;
  fonteDados: string; confianca: number;
  statusDocumento: string; statusConferencia: string; statusCompra: string; statusEstoque: string;
  aprovadoEm: string | null; recebimentoFisicoEm: string | null; estoqueAtualizadoEm: string | null;
  pendenciasAbertas?: number; itens?: NfeItem[]; revisoes?: NfeRevisao[];
  historico?: { id: string; acao: string; status: string; mensagem: string | null; criadoEm: string }[];
}

const post = <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const nfeApi = {
  listar: (p: { statusConferencia?: string; statusCompra?: string; busca?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => !!v) as [string, string][]).toString();
    return request<{ data: NfeDocumento[]; total: number }>(`/nfe/documentos${qs ? `?${qs}` : ''}`);
  },
  detalhe: (id: string) => request<NfeDocumento>(`/nfe/documentos/${id}`),
  fila: (status = 'ABERTO') => request<{ data: NfeRevisao[]; total: number }>(`/nfe/fila-revisao?status=${status}&pageSize=100`),
  resolver: (id: string, decisao: 'ACEITAR' | 'DISPENSAR', observacao: string) => post(`/nfe/fila-revisao/${id}/resolver`, { decisao, observacao }),
  vincularFornecedor: (docId: string, fornecedorId: string) => post<NfeDocumento>(`/nfe/documentos/${docId}/vincular-fornecedor`, { fornecedorId }),
  vincularProduto: (itemId: string, produtoId: string, criarMapeamento: boolean) => post<NfeDocumento>(`/nfe/itens/${itemId}/vincular-produto`, { produtoId, criarMapeamento }),
  dispensarItem: (itemId: string, motivo: string) => post<NfeDocumento>(`/nfe/itens/${itemId}/dispensar`, { motivo }),
  reconciliar: (docId: string) => post<NfeDocumento>(`/nfe/documentos/${docId}/reconciliar`),
  aprovar: (docId: string, observacao: string | undefined, reconheceAlertas: boolean) => post(`/nfe/documentos/${docId}/aprovar`, { observacao, reconheceAlertas }),
  rejeitar: (docId: string, motivo: string) => post(`/nfe/documentos/${docId}/rejeitar`, { motivo }),
  confirmarRecebimento: (docId: string, body: { recebimentoIntegral?: boolean; itens?: { itemId: string; quantidadeRecebida: number }[]; motivoDivergencia?: string }) =>
    post(`/nfe/documentos/${docId}/confirmar-recebimento`, body),
  aplicarEstoque: (docId: string) => post(`/nfe/documentos/${docId}/aplicar-estoque`),
  produtos: (busca: string) => api.produtos.list({ busca, pageSize: 20 }),
  fornecedores: (busca: string) => api.fornecedores.list({ busca, pageSize: 20 }),

  /** upload multipart (nao usa o request JSON para nao forcar Content-Type) */
  async upload(arquivos: File[]): Promise<any> {
    const fd = new FormData();
    for (const f of arquivos) fd.append('arquivo', f, f.name);
    const token = api.getToken();
    const res = await fetch('/api/nfe/upload', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.erro || `HTTP ${res.status}`);
    return corpo;
  },
};
