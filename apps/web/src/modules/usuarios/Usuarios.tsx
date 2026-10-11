import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarDataHora } from '../../lib/format';
import { Loader2, UserPlus, Lock, Unlock, KeyRound, Pencil } from 'lucide-react';

interface UsuarioTela {
  id: string;
  nome: string;
  login: string;
  papel: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
}

const PAPEIS: Array<'ADMIN' | 'GERENTE' | 'VENDEDOR' | 'CAIXA'> = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'];

const corPapel: Record<string, string> = {
  ADMIN: 'bg-vermelho text-white',
  GERENTE: 'bg-azul text-white',
  VENDEDOR: 'bg-verde text-white',
  CAIXA: 'bg-amarelo text-gray-900',
};

export default function Usuarios() {
  const { usuario: usuarioLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioTela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<UsuarioTela | null>(null);
  const [modalRedefinir, setModalRedefinir] = useState<UsuarioTela | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await api.usuarios.list();
      setUsuarios(lista as UsuarioTela[]);
    } catch (e: any) {
      setErro(e.message || 'Erro ao carregar usuarios');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleBloquear(u: UsuarioTela) {
    if (!confirm(`Confirma ${u.ativo ? 'desativar' : 'ativar'} o usuario ${u.nome}?`)) return;
    try {
      await api.usuarios.bloquear(u.id);
      await carregar();
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-azul animate-spin" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-4 rounded bg-red-50 border border-red-200 text-red-700">
        {erro}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500">Gerencie contas de acesso ao sistema</p>
        </div>
        <button
          onClick={() => setModalCriar(true)}
          className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          <UserPlus className="w-4 h-4" />
          Novo usuario
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Login</th>
              <th className="text-left px-4 py-3">Papel</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Ultimo login</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                <td className="px-4 py-3 text-gray-600">{u.login}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${corPapel[u.papel] || 'bg-gray-200'}`}>
                    {u.papel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.ativo ? (
                    <span className="text-verde font-medium">Ativo</span>
                  ) : (
                    <span className="text-vermelho font-medium">Bloqueado</span>
                  )}
                  {u.deveTrocarSenha && (
                    <span className="ml-2 text-xs text-amarelo bg-amber-50 px-1.5 py-0.5 rounded">
                      troca pendente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {u.ultimoLogin ? formatarDataHora(u.ultimoLogin) : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setModalEditar(u)}
                      className="p-1.5 text-gray-600 hover:bg-gray-200 rounded"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setModalRedefinir(u)}
                      className="p-1.5 text-gray-600 hover:bg-gray-200 rounded"
                      title="Redefinir senha"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleBloquear(u)}
                      disabled={u.id === usuarioLogado?.id}
                      className="p-1.5 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title={u.id === usuarioLogado?.id ? 'Voce nao pode se bloquear' : (u.ativo ? 'Bloquear' : 'Ativar')}
                    >
                      {u.ativo ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalCriar && (
        <ModalCriar onClose={() => setModalCriar(false)} onCreated={carregar} />
      )}
      {modalEditar && (
        <ModalEditar usuario={modalEditar} onClose={() => setModalEditar(null)} onSaved={carregar} />
      )}
      {modalRedefinir && (
        <ModalRedefinir usuario={modalRedefinir} onClose={() => setModalRedefinir(null)} />
      )}
    </div>
  );
}

function ModalCriar({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'ADMIN' | 'GERENTE' | 'VENDEDOR' | 'CAIXA'>('VENDEDOR');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) {
      setErro('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSalvando(true);
    try {
      await api.usuarios.create({ nome, login, senha, papel });
      onCreated();
      onClose();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal title="Novo usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome">
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" />
        </Campo>
        <Campo label="Login">
          <input type="text" value={login} onChange={e => setLogin(e.target.value)} required className="input" />
        </Campo>
        <Campo label="Senha (temporaria - usuario trocara no primeiro login)">
          <input type="text" value={senha} onChange={e => setSenha(e.target.value)} required className="input" />
        </Campo>
        <Campo label="Papel">
          <select value={papel} onChange={e => setPapel(e.target.value as any)} className="input">
            {PAPEIS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Campo>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Criar'}
        </button>
      </form>
    </Modal>
  );
}

function ModalEditar({ usuario, onClose, onSaved }: { usuario: UsuarioTela; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(usuario.nome);
  const [papel, setPapel] = useState(usuario.papel);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.usuarios.update(usuario.id, { nome, papel, ativo });
      onSaved();
      onClose();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal title={`Editar ${usuario.login}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome">
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" />
        </Campo>
        <Campo label="Papel">
          <select value={papel} onChange={e => setPapel(e.target.value as any)} className="input">
            {PAPEIS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo label="Ativo">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            <span className="text-sm">Usuario ativo</span>
          </label>
        </Campo>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </Modal>
  );
}

function ModalRedefinir({ usuario, onClose }: { usuario: UsuarioTela; onClose: () => void }) {
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < 6) {
      setErro('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSalvando(true);
    try {
      await api.usuarios.redefinirSenha(usuario.id, novaSenha);
      alert(`Senha redefinida para ${usuario.login}. O usuario devera troca-la no proximo login.`);
      onClose();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal title={`Redefinir senha - ${usuario.login}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nova senha temporaria (min. 6)">
          <input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required className="input" />
        </Campo>
        <p className="text-xs text-gray-500">
          O usuario devera trocar esta senha no proximo login. Sessoes ativas serao encerradas.
        </p>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Redefinir senha'}
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
