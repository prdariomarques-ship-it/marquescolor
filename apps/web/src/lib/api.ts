const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function setTokens(token: string, refreshToken: string): void {
  localStorage.setItem('token', token);
  localStorage.setItem('refreshToken', refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.token, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, { ...init, headers });

  // Se 401, tenta refresh uma vez
  if (res.status === 401 && !(init?.headers as Record<string, string>)?.['X-No-Retry']) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = getToken();
      if (newToken) headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${BASE}${path}`, { ...init, headers });
    } else {
      clearTokens();
      throw new Error('Sessao expirada');
    }
  }

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      errMessage = err.erro || err.message || errMessage;
    } catch {
      // body nao e JSON
    }
    const error = new Error(errMessage) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // Auth
  login: (login: string, senha: string) =>
    request<{
      token: string;
      refreshToken: string;
      user: { id: string; nome: string; login: string; papel: string; deveTrocarSenha: boolean };
      deveTrocarSenha: boolean;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, senha }),
      headers: { 'X-No-Retry': '1' } as any,
    }),
  refresh: (refreshToken: string) =>
    request<{ token: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      headers: { 'X-No-Retry': '1' } as any,
    }),
  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    request<{ ok: boolean }>('/auth/trocar-senha', {
      method: 'POST',
      body: JSON.stringify({ senhaAtual, novaSenha, confirmar: novaSenha }),
    }),
  logout: (refreshToken: string) =>
    request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  me: () =>
    request<{
      id: string;
      nome: string;
      login: string;
      papel: string;
      ativo: boolean;
      deveTrocarSenha: boolean;
    }>('/auth/me'),

  // Usuarios
  usuarios: {
    list: () =>
      request<Array<{
        id: string; nome: string; login: string; papel: string;
        ativo: boolean; deveTrocarSenha: boolean; ultimoLogin: string | null;
        criadoEm: string;
      }>>('/usuarios'),
    get: (id: string) =>
      request<{
        id: string; nome: string; login: string; papel: string;
        ativo: boolean; deveTrocarSenha: boolean;
      }>(`/usuarios/${id}`),
    create: (data: { nome: string; login: string; senha: string; papel: string }) =>
      request('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { nome?: string; papel?: string; ativo?: boolean }) =>
      request(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/usuarios/${id}`, { method: 'DELETE' }),
    bloquear: (id: string) =>
      request<{ ok: boolean; ativo: boolean }>(`/usuarios/${id}/bloquear`, { method: 'POST' }),
    redefinirSenha: (id: string, novaSenha: string) =>
      request(`/usuarios/${id}/redefinir-senha`, {
        method: 'POST',
        body: JSON.stringify({ novaSenha }),
      }),
  },

  // Health
  health: () =>
    request<{ ok: boolean; banco: boolean; loja: string; versao: string; hora: string }>('/health'),

  // Categorias
  categorias: {
    list: (params?: { ativo?: string; busca?: string }) =>
      request<Array<{ id: string; nome: string; corHex: string | null; ativo: boolean }>>(
        '/categorias' + (params ? '?' + new URLSearchParams(params as any).toString() : '')
      ),
    create: (data: { nome: string; corHex?: string; ativo?: boolean }) =>
      request('/categorias', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { nome?: string; corHex?: string; ativo?: boolean }) =>
      request(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/categorias/${id}`, { method: 'DELETE' }),
  },

  // Marcas
  marcas: {
    list: (params?: { ativo?: string; busca?: string }) =>
      request<Array<{ id: string; nome: string; ativo: boolean }>>(
        '/marcas' + (params ? '?' + new URLSearchParams(params as any).toString() : '')
      ),
    create: (data: { nome: string; ativo?: boolean }) =>
      request('/marcas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { nome?: string; ativo?: boolean }) =>
      request(`/marcas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/marcas/${id}`, { method: 'DELETE' }),
  },

  // Produtos
  produtos: {
    list: (params?: { busca?: string; ativo?: string; categoriaId?: string; marcaId?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{
        data: Array<any>;
        page: number; pageSize: number; total: number; totalPages: number;
      }>(`/produtos${qs}`);
    },
    get: (id: string) => request(`/produtos/${id}`),
    create: (data: any) =>
      request('/produtos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/produtos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/produtos/${id}`, { method: 'DELETE' }),
    importar: (csv: string) =>
      request('/produtos/importar', { method: 'POST', body: JSON.stringify({ csv }) }),
    baixarTemplate: async () => {
      const token = getToken();
      const res = await fetch('/api/produtos/template-csv', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      return await res.text();
    },
  },

  // Clientes
  clientes: {
    list: (params?: { busca?: string; ativo?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{
        data: Array<any>;
        page: number; pageSize: number; total: number; totalPages: number;
      }>(`/clientes${qs}`);
    },
    get: (id: string) => request(`/clientes/${id}`),
    create: (data: any) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
    importar: (csv: string) => request('/clientes/importar', { method: 'POST', body: JSON.stringify({ csv }) }),
    baixarTemplate: async () => {
      const token = getToken();
      const res = await fetch('/api/clientes/template-csv', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      return await res.text();
    },
  },

  // Fornecedores
  fornecedores: {
    list: (params?: { busca?: string; ativo?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{
        data: Array<any>;
        page: number; pageSize: number; total: number; totalPages: number;
      }>(`/fornecedores${qs}`);
    },
    get: (id: string) => request(`/fornecedores/${id}`),
    create: (data: any) => request('/fornecedores', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/fornecedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/fornecedores/${id}`, { method: 'DELETE' }),
    importar: (csv: string) => request('/fornecedores/importar', { method: 'POST', body: JSON.stringify({ csv }) }),
    baixarTemplate: async () => {
      const token = getToken();
      const res = await fetch('/api/fornecedores/template-csv', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      return await res.text();
    },
  },

  // Estoque
  estoque: {
    visaoGeral: (params?: { busca?: string; status?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/estoque${qs}`);
    },
    movimentacoes: (params?: { produtoId?: string; tipo?: string; dataInicio?: string; dataFim?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/estoque/movimentacoes${qs}`);
    },
    entrada: (data: any) => request('/estoque/entrada', { method: 'POST', body: JSON.stringify(data) }),
    saida: (data: any) => request('/estoque/saida', { method: 'POST', body: JSON.stringify(data) }),
    ajuste: (data: any) => request('/estoque/ajuste', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Busca rapida de produtos para PDV
  produtosBusca: (q: string) => {
    const qs = '?' + new URLSearchParams({ busca: q, pageSize: '20' }).toString();
    return request<{ data: Array<any>; total: number }>(`/produtos${qs}`);
  },

  // Vendas
  vendas: {
    list: (params?: { busca?: string; status?: string; dataInicio?: string; dataFim?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/vendas${qs}`);
    },
    get: (id: string) => request(`/vendas/${id}`),
    finalizar: (data: any) => request('/vendas', { method: 'POST', body: JSON.stringify(data) }),
    cancelar: (id: string, motivo: string) => request(`/vendas/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  },

  // Caixa
  caixa: {
    status: () => request<{ aberto: boolean; sessao?: any; valorEsperadoCentavos?: number }>('/caixa/status'),
    abrir: (data: { valorAberturaCentavos: number; observacao?: string }) =>
      request('/caixa/abrir', { method: 'POST', body: JSON.stringify(data) }),
    movimentacao: (sessaoId: string, data: any) =>
      request(`/caixa/${sessaoId}/movimentacao`, { method: 'POST', body: JSON.stringify(data) }),
    fechar: (sessaoId: string, data: any) =>
      request(`/caixa/${sessaoId}/fechar`, { method: 'POST', body: JSON.stringify(data) }),
    historico: (params?: { page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/caixa/historico${qs}`);
    },
    detalhe: (id: string) => request(`/caixa/${id}`),
  },

  // Configuracoes
  configuracoes: {
    get: () => request<any>('/configuracoes'),
    update: (data: any) => request('/configuracoes', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Dashboard
  dashboard: {
    metricas: () => request<{
      totalVendidoHoje: number;
      numVendasHoje: number;
      estoqueBaixo: number;
      valorEmCaixa: number;
      vendasPendentes: number;
      caixaAberto: boolean;
      ultimasVendas: Array<{
        id: string; numero: number; totalCentavos: number;
        status: string; clienteNome: string; criadoEm: string;
      }>;
    }>('/dashboard/metricas'),
  },

  // Compras
  compras: {
    list: (params?: { status?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/compras${qs}`);
    },
    get: (id: string) => request(`/compras/${id}`),
    create: (data: any) => request('/compras', { method: 'POST', body: JSON.stringify(data) }),
    confirmar: (id: string) => request(`/compras/${id}/confirmar`, { method: 'POST' }),
  },

  // Orcamentos
  orcamentos: {
    list: (params?: { status?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/orcamentos${qs}`);
    },
    get: (id: string) => request(`/orcamentos/${id}`),
    create: (data: any) => request('/orcamentos', { method: 'POST', body: JSON.stringify(data) }),
    aprovar: (id: string) => request(`/orcamentos/${id}/aprovar`, { method: 'POST' }),
    cancelar: (id: string) => request(`/orcamentos/${id}/cancelar`, { method: 'POST' }),
    delete: (id: string) => request(`/orcamentos/${id}`, { method: 'DELETE' }),
  },

  // Financeiro
  financeiro: {
    contasReceber: (params?: { status?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/contas-receber${qs}`);
    },
    criarContaReceber: (data: any) => request('/contas-receber', { method: 'POST', body: JSON.stringify(data) }),
    baixarContaReceber: (id: string, data: any) => request(`/contas-receber/${id}/baixar`, { method: 'POST', body: JSON.stringify(data) }),
    cancelarContaReceber: (id: string) => request(`/contas-receber/${id}`, { method: 'DELETE' }),

    contasPagar: (params?: { status?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<{ data: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/contas-pagar${qs}`);
    },
    criarContaPagar: (data: any) => request('/contas-pagar', { method: 'POST', body: JSON.stringify(data) }),
    baixarContaPagar: (id: string, data: any) => request(`/contas-pagar/${id}/baixar`, { method: 'POST', body: JSON.stringify(data) }),
    cancelarContaPagar: (id: string) => request(`/contas-pagar/${id}`, { method: 'DELETE' }),
  },

  // Relatorios
  relatorios: {
    vendas: (params?: { dataInicio?: string; dataFim?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<any>(`/relatorios/vendas${qs}`);
    },
    produtosMaisVendidos: (params?: { dataInicio?: string; dataFim?: string; limite?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<any>(`/relatorios/produtos-mais-vendidos${qs}`);
    },
    formasPagamento: (params?: { dataInicio?: string; dataFim?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<any>(`/relatorios/formas-pagamento${qs}`);
    },
    lucro: (params?: { dataInicio?: string; dataFim?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request<any>(`/relatorios/lucro${qs}`);
    },
    estoque: () => request<any>('/relatorios/estoque'),
  },

  // Backup
  backup: {
    exportar: async () => {
      const token = getToken();
      const res = await fetch('/api/backup/exportar', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      return await res.json();
    },
    restaurar: (dados: any) => request('/backup/restaurar', { method: 'POST', body: JSON.stringify(dados) }),
  },

  // Helpers de token
  setTokens,
  clearTokens,
  getToken,
};

export { clearTokens, setTokens };
