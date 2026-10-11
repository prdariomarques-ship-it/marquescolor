import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, clearTokens } from '../lib/api';

interface Usuario {
  id: string;
  nome: string;
  login: string;
  papel: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
}

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (login: string, senha: string) => Promise<{ deveTrocarSenha: boolean }>;
  logout: () => Promise<void>;
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
  recarregarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function recarregarUsuario() {
    const token = api.getToken();
    if (!token) {
      setUsuario(null);
      setCarregando(false);
      return;
    }
    try {
      const me = await api.me();
      setUsuario(me);
    } catch {
      clearTokens();
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregarUsuario();
  }, []);

  async function login(loginInput: string, senha: string) {
    const res = await api.login(loginInput, senha);
    api.setTokens(res.token, res.refreshToken);
    setUsuario({
      id: res.user.id,
      nome: res.user.nome,
      login: res.user.login,
      papel: res.user.papel,
      ativo: true,
      deveTrocarSenha: res.deveTrocarSenha,
    });
    return { deveTrocarSenha: res.deveTrocarSenha };
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // Ignora erro de logout no servidor
      }
    }
    clearTokens();
    setUsuario(null);
  }

  async function trocarSenha(senhaAtual: string, novaSenha: string) {
    await api.trocarSenha(senhaAtual, novaSenha);
    setUsuario(u => u ? { ...u, deveTrocarSenha: false } : u);
  }

  return (
    <AuthContext.Provider value={{
      usuario, carregando, login, logout, trocarSenha, recarregarUsuario,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
