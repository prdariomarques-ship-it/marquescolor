import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { Loader2 } from 'lucide-react';

export default function TrocarSenha() {
  const { usuario, trocarSenha, logout } = useAuth();
  const navigate = useNavigate();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 6) {
      setErro('Nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (novaSenha !== confirmar) {
      setErro('Confirmacao nao bate com a nova senha');
      return;
    }
    if (novaSenha === senhaAtual) {
      setErro('Nova senha deve ser diferente da atual');
      return;
    }

    setCarregando(true);
    try {
      await trocarSenha(senhaAtual, novaSenha);
      navigate('/');
    } catch (e: any) {
      setErro(e.message || 'Erro ao trocar senha');
    } finally {
      setCarregando(false);
    }
  }

  async function handleSair() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-fundo flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Troca de senha obrigatoria
        </h1>
        <p className="text-gray-500 text-center mb-6 text-sm">
          {usuario?.deveTrocarSenha
            ? 'Voce precisa definir uma nova senha antes de continuar.'
            : 'Defina uma nova senha para a sua conta.'}
        </p>

        {erro && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha atual
            </label>
            <input
              type="password"
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-azul"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha (min. 6)
            </label>
            <input
              type="password"
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-azul"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar nova senha
            </label>
            <input
              type="password"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-azul"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2.5 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {carregando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Trocar senha'
            )}
          </button>
        </form>

        <button
          onClick={handleSair}
          className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
