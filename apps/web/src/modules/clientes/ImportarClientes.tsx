import { useState } from 'react';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';
import { Loader2, Upload, Download, ArrowLeft } from 'lucide-react';

export default function ImportarClientes() {
  const [csv, setCsv] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleBaixarTemplate() {
    try {
      const tpl = await api.clientes.baixarTemplate();
      const blob = new Blob([tpl], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'template-clientes.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e.message); }
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function handleImportar() {
    if (!csv.trim()) { setErro('Cole o CSV ou selecione um arquivo'); return; }
    setSalvando(true); setErro(null); setResultado(null);
    try { setResultado(await api.clientes.importar(csv)); }
    catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Importar clientes</h1>
      <p className="text-sm text-gray-500 mb-6">Importe varios clientes via CSV. Atualiza por CPF/CNPJ se ja existir.</p>

      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Formato esperado</h2>
          <button onClick={handleBaixarTemplate} className="inline-flex items-center gap-1 bg-verde hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm">
            <Download className="w-4 h-4" /> Baixar template
          </button>
        </div>
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto border">
{`nome,cpfCnpj,telefone,whatsapp,email,cep,endereco,numero,complemento,bairro,cidade,uf,limiteCreditoCentavos
Joao da Silva,12345678901,11987654321,11987654321,joao@email.com,09442-000,Rua das Flores,100,Apto 2,Centro,Ribeirao Pires,SP,100000`}
        </pre>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Carregar CSV</h2>
        <input type="file" accept=".csv,text/csv" onChange={handleArquivo} className="block mb-3 text-sm" />
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={10} placeholder="nome,cpfCnpj,telefone,..." className="input font-mono text-xs" />
      </div>

      {erro && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>}

      {resultado && (
        <div className="mb-4 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-2">Resultado</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-verde/10 p-3 rounded text-center"><p className="text-2xl font-bold text-verde">{resultado.criados}</p><p className="text-xs text-gray-600">Criados</p></div>
            <div className="bg-azul/10 p-3 rounded text-center"><p className="text-2xl font-bold text-azul">{resultado.atualizados}</p><p className="text-xs text-gray-600">Atualizados</p></div>
            <div className="bg-vermelho/10 p-3 rounded text-center"><p className="text-2xl font-bold text-vermelho">{resultado.erros}</p><p className="text-xs text-gray-600">Erros</p></div>
          </div>
        </div>
      )}

      <button onClick={handleImportar} disabled={salvando || !csv.trim()} className="inline-flex items-center gap-2 bg-azul hover:bg-blue-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {salvando ? 'Importando...' : 'Importar'}
      </button>
    </div>
  );
}
