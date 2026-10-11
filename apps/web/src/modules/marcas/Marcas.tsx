import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

interface Marca {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function Marcas() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<Marca | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const lista = await api.marcas.list({ busca });
      setMarcas(lista as Marca[]);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [busca]);

  async function handleDesativar(m: Marca) {
    if (!confirm(`Desativar marca "${m.nome}"?`)) return;
    try { await api.marcas.delete(m.id); await carregar(); }
    catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marcas</h1>
          <p className="text-sm text-gray-500">Marcas de produtos (Suvinil, Coral, etc.)</p>
        </div>
        <button onClick={() => setModalCriar(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
          <Plus className="w-4 h-4" /> Nova marca
        </button>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Buscar marca..." value={busca} onChange={e => setBusca(e.target.value)} className="input max-w-sm" />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {marcas.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{m.nome}</td>
                <td className="px-4 py-3">
                  {m.ativo ? <span className="text-verde font-medium">Ativo</span> : <span className="text-vermelho font-medium">Desativado</span>}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setModalEditar(m)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Editar"><Pencil className="w-4 h-4" /></button>
                  {m.ativo && <button onClick={() => handleDesativar(m)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Desativar"><Trash2 className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {marcas.length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma marca encontrada</p>}
      </div>

      {modalCriar && <ModalCriar onClose={() => setModalCriar(false)} onSaved={carregar} />}
      {modalEditar && <ModalEditar marca={modalEditar} onClose={() => setModalEditar(null)} onSaved={carregar} />}
    </div>
  );
}

function ModalCriar({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try { await api.marcas.create({ nome }); onSaved(); onClose(); }
    catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal title="Nova marca" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome"><input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" autoFocus /></Campo>
        <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Criar'}
        </button>
      </form>
    </Modal>
  );
}

function ModalEditar({ marca, onClose, onSaved }: { marca: Marca; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(marca.nome);
  const [ativo, setAtivo] = useState(marca.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try { await api.marcas.update(marca.id, { nome, ativo }); onSaved(); onClose(); }
    catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal title={`Editar ${marca.nome}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
        <Campo label="Nome"><input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" /></Campo>
        <Campo label="Ativo">
          <label className="flex items-center gap-2"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /><span className="text-sm">Marca ativa</span></label>
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
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button></div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>;
}
