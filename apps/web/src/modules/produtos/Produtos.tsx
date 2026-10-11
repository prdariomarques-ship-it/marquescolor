import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { formatarCentavos } from '../../lib/format';
import { Plus, Pencil, Trash2, Loader2, Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Produto {
  id: string;
  codigoInterno: string;
  codigoBarras: string | null;
  nome: string;
  unidade: string;
  precoVendaCentavos: number;
  precoCustoCentavos: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  ativo: boolean;
  marca: { id: string; nome: string } | null;
  categoria: { id: string; nome: string; corHex: string | null } | null;
}

const UNIDADES = ['UN', 'L', 'KG', 'M', 'CX', 'GL', 'BD', 'LATAS'];

export default function Produtos() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [filtroEstoqueBaixo, setFiltroEstoqueBaixo] = useState(false);
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<Produto | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const params: any = {};
      if (busca) params.busca = busca;
      if (filtroAtivo === 'ativos') params.ativo = 'true';
      if (filtroAtivo === 'inativos') params.ativo = 'false';
      if (filtroEstoqueBaixo) params.estoqueBaixo = 'true';
      params.pageSize = 100;
      const res = await api.produtos.list(params);
      setProdutos(res.data);
      setTotal(res.total);
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, [busca, filtroAtivo, filtroEstoqueBaixo]);

  async function handleDesativar(p: Produto) {
    if (!confirm(`Desativar produto "${p.nome}"?`)) return;
    try { await api.produtos.delete(p.id); await carregar(); }
    catch (e: any) { alert(e.message); }
  }

  if (carregando) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500">{total} produto(s) cadastrado(s)</p>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Link to="/produtos/importar" className="inline-flex items-center gap-2 bg-verde hover:bg-green-700 text-white px-4 py-2 rounded font-medium">
              <Upload className="w-4 h-4" /> Importar CSV
            </Link>
            <button onClick={() => setModalCriar(true)} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
              <Plus className="w-4 h-4" /> Novo produto
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" placeholder="Buscar por nome, codigo..." value={busca}
            onChange={e => setBusca(e.target.value)}
            className="input pl-9 max-w-sm"
          />
        </div>
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value as any)} className="input max-w-xs">
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border rounded cursor-pointer hover:bg-gray-50">
          <input type="checkbox" checked={filtroEstoqueBaixo} onChange={e => setFiltroEstoqueBaixo(e.target.checked)} />
          <span className="text-sm">Estoque baixo</span>
        </label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Codigo</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Marca</th>
              <th className="text-left px-4 py-3">Categoria</th>
              <th className="text-left px-4 py-3">Unidade</th>
              <th className="text-right px-4 py-3">Custo</th>
              <th className="text-right px-4 py-3">Venda</th>
              <th className="text-right px-4 py-3">Estoque</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {produtos.map(p => {
              const estoqueBaixo = p.estoqueMinimo > 0 && p.estoqueAtual <= p.estoqueMinimo;
              return (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.ativo ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.codigoInterno}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3">{p.marca?.nome || '-'}</td>
                  <td className="px-4 py-3">
                    {p.categoria ? (
                      <span className="inline-flex items-center gap-1">
                        {p.categoria.corHex && <span className="w-2 h-2 rounded-full" style={{ background: p.categoria.corHex }} />}
                        {p.categoria.nome}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.unidade}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatarCentavos(p.precoCustoCentavos)}</td>
                  <td className="px-4 py-3 text-right font-medium text-verde">{formatarCentavos(p.precoVendaCentavos)}</td>
                  <td className={`px-4 py-3 text-right ${estoqueBaixo ? 'text-vermelho font-bold' : ''}`}>{p.estoqueAtual}</td>
                  <td className="px-4 py-3">
                    {p.ativo ? <span className="text-verde">Ativo</span> : <span className="text-vermelho">Desativ.</span>}
                  </td>
                  <td className="px-4 py-3">
                    {podeEditar && (
                      <>
                        <button onClick={() => setModalEditar(p)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Editar"><Pencil className="w-4 h-4" /></button>
                        {p.ativo && <button onClick={() => handleDesativar(p)} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Desativar"><Trash2 className="w-4 h-4" /></button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {produtos.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum produto encontrado</p>}
      </div>

      {modalCriar && <ModalProduto onClose={() => setModalCriar(false)} onSaved={carregar} />}
      {modalEditar && <ModalProduto produto={modalEditar} onClose={() => setModalEditar(null)} onSaved={carregar} />}
    </div>
  );
}

function ModalProduto({ produto, onClose, onSaved }: { produto?: Produto; onClose: () => void; onSaved: () => void }) {
  const editando = !!produto;
  const [codigoInterno, setCodigoInterno] = useState(produto?.codigoInterno || '');
  const [codigoBarras, setCodigoBarras] = useState(produto?.codigoBarras || '');
  const [nome, setNome] = useState(produto?.nome || '');
  const [marcaId, setMarcaId] = useState(produto?.marca?.id || '');
  const [categoriaId, setCategoriaId] = useState(produto?.categoria?.id || '');
  const [unidade, setUnidade] = useState(produto?.unidade || 'UN');
  const [precoCusto, setPrecoCusto] = useState(produto ? produto.precoCustoCentavos / 100 : 0);
  const [precoVenda, setPrecoVenda] = useState(produto ? produto.precoVendaCentavos / 100 : 0);
  const [estoqueMinimo, setEstoqueMinimo] = useState(produto?.estoqueMinimo || 0);
  const [estoqueMaximo, setEstoqueMaximo] = useState(produto?.estoqueMaximo || 0);
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [marcas, setMarcas] = useState<Array<{ id: string; nome: string }>>([]);
  const [categorias, setCategorias] = useState<Array<{ id: string; nome: string }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.marcas.list({ ativo: 'true' }), api.categorias.list({ ativo: 'true' })])
      .then(([m, c]) => { setMarcas(m); setCategorias(c); })
      .catch(e => setErro(e.message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const data = {
        codigoInterno, codigoBarras: codigoBarras || null,
        nome, marcaId: marcaId || null, categoriaId: categoriaId || null,
        unidade, precoCustoCentavos: Math.round(precoCusto * 100),
        precoVendaCentavos: Math.round(precoVenda * 100),
        estoqueMinimo, estoqueMaximo, ativo,
      };
      if (editando && produto) await api.produtos.update(produto.id, data);
      else await api.produtos.create(data);
      onSaved();
      onClose();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">{editando ? `Editar ${produto!.nome}` : 'Novo produto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {erro && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Codigo interno *"><input type="text" value={codigoInterno} onChange={e => setCodigoInterno(e.target.value)} required className="input" /></Campo>
            <Campo label="Codigo de barras"><input type="text" value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} className="input" /></Campo>
          </div>
          <Campo label="Nome *"><input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="input" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Marca">
              <select value={marcaId} onChange={e => setMarcaId(e.target.value)} className="input">
                <option value="">(sem marca)</option>
                {marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Categoria">
              <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className="input">
                <option value="">(sem categoria)</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Unidade">
              <select value={unidade} onChange={e => setUnidade(e.target.value)} className="input">
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
            <Campo label="Preco custo (R$)"><input type="number" step="0.01" min="0" value={precoCusto} onChange={e => setPrecoCusto(parseFloat(e.target.value) || 0)} className="input" /></Campo>
            <Campo label="Preco venda (R$)"><input type="number" step="0.01" min="0" value={precoVenda} onChange={e => setPrecoVenda(parseFloat(e.target.value) || 0)} className="input" /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Estoque minimo"><input type="number" min="0" step="0.001" value={estoqueMinimo} onChange={e => setEstoqueMinimo(parseFloat(e.target.value) || 0)} className="input" /></Campo>
            <Campo label="Estoque maximo"><input type="number" min="0" step="0.001" value={estoqueMaximo} onChange={e => setEstoqueMaximo(parseFloat(e.target.value) || 0)} className="input" /></Campo>
          </div>
          <Campo label="Ativo">
            <label className="flex items-center gap-2"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /><span className="text-sm">Produto ativo</span></label>
          </Campo>
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
