import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginInput, setLoginInput] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const { deveTrocarSenha } = await login(loginInput, senha);
      if (deveTrocarSenha) {
        navigate('/trocar-senha');
      } else {
        navigate('/');
      }
    } catch (e: any) {
      setErro(e.message || 'Erro ao logar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-fundo flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 border border-gray-100">
        {/* Barra de cores de tinta */}
        <div className="flex gap-1 mb-6 justify-center">
          <div className="w-3 h-12 rounded bg-azul" />
          <div className="w-3 h-12 rounded bg-amarelo" />
          <div className="w-3 h-12 rounded bg-vermelho" />
          <div className="w-3 h-12 rounded bg-verde" />
          <div className="w-3 h-12 rounded bg-laranja" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">
          Marquescollor Tintas
        </h1>
        <p className="text-gray-500 text-center mb-6">Sistema de Vendas</p>

        {erro && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={loginInput}
              onChange={e => setLoginInput(e.target.value)}
              autoFocus
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-azul"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-azul"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(m => !m)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2.5 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {carregando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400 text-center">
          Marquescollor Tintas - Ribeirao Pires/SP
        </p>
      </div>
    </div>
  );
}
