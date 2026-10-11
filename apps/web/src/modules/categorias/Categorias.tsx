import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

interface Categoria {
  id: string;
  nome: string;
  corHex: string | null;
  ativo: boolean;
}

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<Categoria | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const lista = await api.categorias.list({ busca });
      setCategorias(lista as Categoria[]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [busca]);

  async function handleDesativar(cat: Categoria) {
    if (!confirm(`Desativar categoria "${cat.nome}"?`)) return;
    try {
      await api.categorias.delete(cat.id);
      await carregar();
    } catch (e: any) { alert(e.message); }
  }

  if (carregando) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="text-sm text-gray-500">Organize produtos por categoria (tinta, ferramenta, etc.)</p>
        </div>
        <button onClick={() => setModalCriar(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
          <Plus className="w-4 h-4" /> Nova categoria
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text" placeholder="Buscar categoria..." value={busca} onChange={e => setBusca(e.target.value)}
          className="input max-w-sm"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Cor</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categorias.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {c.corHex ? <div className="w-6 h-6 rounded" style={{ background: c.corHex }} /> : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                <td className="px-4 py-3">
                  {c.ativo ? <span className="text-verde font-medium">Ativo</span> : <span className="text-vermelho font-medium">Desativado</span>}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setModalEditar(c)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Editar"><Pencil className="w-4 h-4" /></button>
                  {c.ativo && <button onClick={() => handleDesativar(c)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Desativar"><Trash2 className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categorias.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma categoria encontrada</p>}
      </div>

      {modalCriar && <ModalCriar onClose={() => setModalCriar(false)} onSaved={carregar} />}
      {modalEditar && <ModalEditar categoria={modalEditar} onClose={() => setModalEditar(null)} onSaved={carregar} />}
    </div>
  );
}

function ModalCriar({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState('');
  const [corHex, setCorHex] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.categorias.create({ nome, corHex: corHex || undefined });
      onSaved();
      onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal title="Nova categoria" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome"><input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" autoFocus /></Campo>
        <Campo label="Cor (opcional)">
          <input type="color" value={corHex || '#1E63B8'} onChange={e => setCorHex(e.target.value)} className="w-12 h-10 rounded cursor-pointer" />
          <input type="text" value={corHex} onChange={e => setCorHex(e.target.value)} placeholder="#1E63B8" className="input ml-2 inline w-32" />
        </Campo>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Criar'}
        </button>
      </form>
    </Modal>
  );
}

function ModalEditar({ categoria, onClose, onSaved }: { categoria: Categoria; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(categoria.nome);
  const [corHex, setCorHex] = useState(categoria.corHex || '');
  const [ativo, setAtivo] = useState(categoria.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.categorias.update(categoria.id, { nome, corHex: corHex || undefined, ativo });
      onSaved();
      onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal title={`Editar ${categoria.nome}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome"><input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" /></Campo>
        <Campo label="Cor">
          <input type="color" value={corHex || '#1E63B8'} onChange={e => setCorHex(e.target.value)} className="w-12 h-10 rounded cursor-pointer" />
        </Campo>
        <Campo label="Ativo">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            <span className="text-sm">Categoria ativa</span>
          </label>
        </Campo>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Salvar'}
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
  return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>;
}
