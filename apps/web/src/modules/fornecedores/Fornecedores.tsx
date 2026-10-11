import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { Plus, Pencil, Trash2, Loader2, Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Fornecedor {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  contato: string | null;
  ativo: boolean;
}

export default function Fornecedores() {
  const { usuario } = useAuth();
  const podeImportar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<Fornecedor | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await api.fornecedores.list({ busca, pageSize: 100 });
      setFornecedores(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [busca]);

  async function handleDesativar(f: Fornecedor) {
    if (!confirm(`Desativar fornecedor "${f.razaoSocial}"?`)) return;
    try { await api.fornecedores.delete(f.id); await carregar(); }
    catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
          <p className="text-sm text-gray-500">{total} fornecedor(es) cadastrado(s)</p>
        </div>
        {podeImportar && (
          <div className="flex gap-2">
            <Link to="/fornecedores/importar" className="inline-flex items-center gap-2 bg-verde hover:bg-green-700 text-white px-4 py-2 rounded font-medium">
              <Upload className="w-4 h-4" /> Importar CSV
            </Link>
            <button onClick={() => setModalCriar(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
              <Plus className="w-4 h-4" /> Novo fornecedor
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" placeholder="Buscar por razao social, CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} className="input pl-9 max-w-sm" />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Razao social</th>
              <th className="text-left px-4 py-3">Nome fantasia</th>
              <th className="text-left px-4 py-3">CNPJ</th>
              <th className="text-left px-4 py-3">Telefone</th>
              <th className="text-left px-4 py-3">Cidade/UF</th>
              <th className="text-left px-4 py-3">Contato</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fornecedores.map(f => (
              <tr key={f.id} className={`hover:bg-gray-50 ${!f.ativo ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{f.razaoSocial}</td>
                <td className="px-4 py-3">{f.nomeFantasia || '-'}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.cnpj || '-'}</td>
                <td className="px-4 py-3">{f.telefone || '-'}</td>
                <td className="px-4 py-3">{f.cidade && f.uf ? `${f.cidade}/${f.uf}` : '-'}</td>
                <td className="px-4 py-3">{f.contato || '-'}</td>
                <td className="px-4 py-3">
                  {f.ativo ? <span className="text-verde">Ativo</span> : <span className="text-vermelho">Desativ.</span>}
                </td>
                <td className="px-4 py-3">
                  {podeImportar && (
                    <>
                      <button onClick={() => setModalEditar(f)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Editar"><Pencil className="w-4 h-4" /></button>
                      {f.ativo && <button onClick={() => handleDesativar(f)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Desativar"><Trash2 className="w-4 h-4" /></button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fornecedores.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum fornecedor encontrado</p>}
      </div>

      {modalCriar && <ModalFornecedor onClose={() => setModalCriar(false)} onSaved={carregar} />}
      {modalEditar && <ModalFornecedor fornecedor={modalEditar} onClose={() => setModalEditar(null)} onSaved={carregar} />}
    </div>
  );
}

function ModalFornecedor({ fornecedor, onClose, onSaved }: { fornecedor?: Fornecedor; onClose: () => void; onSaved: () => void }) {
  const editando = !!fornecedor;
  const [razaoSocial, setRazaoSocial] = useState(fornecedor?.razaoSocial || '');
  const [nomeFantasia, setNomeFantasia] = useState(fornecedor?.nomeFantasia || '');
  const [cnpj, setCnpj] = useState(fornecedor?.cnpj || '');
  const [telefone, setTelefone] = useState(fornecedor?.telefone || '');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState(fornecedor?.email || '');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState(fornecedor?.cidade || '');
  const [uf, setUf] = useState(fornecedor?.uf || '');
  const [contato, setContato] = useState(fornecedor?.contato || '');
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      const data = {
        razaoSocial, nomeFantasia: nomeFantasia || null, cnpj: cnpj || null,
        telefone: telefone || null, whatsapp: whatsapp || null, email: email || null,
        cep: cep || null, endereco: endereco || null, numero: numero || null,
        bairro: bairro || null, cidade: cidade || null, uf: uf || null,
        contato: contato || null, ativo,
      };
      if (editando && fornecedor) await api.fornecedores.update(fornecedor.id, data);
      else await api.fornecedores.create(data);
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">{editando ? `Editar ${fornecedor!.razaoSocial}` : 'Novo fornecedor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
          <Campo label="Razao social *"><input type="text" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} required className="input" autoFocus /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome fantasia"><input type="text" value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} className="input" /></Campo>
            <Campo label="CNPJ"><input type="text" value={cnpj} onChange={e => setCnpj(e.target.value)} className="input" /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Telefone"><input type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="input" /></Campo>
            <Campo label="WhatsApp"><input type="text" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="input" /></Campo>
          </div>
          <Campo label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" /></Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="CEP"><input type="text" value={cep} onChange={e => setCep(e.target.value)} className="input" /></Campo>
            <Campo label="Endereco"><input type="text" value={endereco} onChange={e => setEndereco(e.target.value)} className="input" /></Campo>
            <Campo label="Numero"><input type="text" value={numero} onChange={e => setNumero(e.target.value)} className="input" /></Campo>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Bairro"><input type="text" value={bairro} onChange={e => setBairro(e.target.value)} className="input" /></Campo>
            <Campo label="Cidade"><input type="text" value={cidade} onChange={e => setCidade(e.target.value)} className="input" /></Campo>
            <Campo label="UF"><input type="text" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())} className="input" /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Contato"><input type="text" value={contato} onChange={e => setContato(e.target.value)} className="input" /></Campo>
            <Campo label="Ativo">
              <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /><span className="text-sm">Fornecedor ativo</span></label>
            </Campo>
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-azul hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50">
            {salvando ? 'Salvando...' : (editando ? 'Salvar' : 'Criar')}
          </button>
        </form>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>;
}
