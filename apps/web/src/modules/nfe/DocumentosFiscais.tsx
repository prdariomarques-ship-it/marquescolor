// Tela "Documentos fiscais": recebimento (upload), conferencia, fila de revisao humana,
// aprovacao e recebimento fisico de NF-e. As etapas aparecem SEPARADAS de proposito:
// documento interpretado != conferido != aprovado != recebido fisicamente != estoque atualizado.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, RefreshCw, CheckCircle2, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { useAuth } from '../../stores/auth';
import { formatarCentavos, formatarData, formatarDataHora } from '../../lib/format';
import { nfeApi, type NfeDocumento, type NfeItem, type NfeRevisao } from './nfeApi';

const FONTE_ROTULO: Record<string, string> = { XML: 'XML (fonte confiavel)', PDF_TEXTO: 'Texto de PDF (aproximado)', OCR: 'OCR (aproximado)', MULTIMODAL: 'Interpretacao multimodal (sugestao)' };

function Chip({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const cor = ok === true ? 'bg-green-100 text-green-800' : ok === false ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cor}`}>{children}</span>;
}

function Etapas({ d }: { d: NfeDocumento }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs" aria-label="Etapas do documento">
      <Chip ok={d.statusDocumento === 'INTERPRETADO'}>1. Documento {d.statusDocumento === 'INTERPRETADO' ? 'interpretado' : 'com falha'}</Chip>
      <Chip ok={d.statusConferencia === 'CONFERIDA' ? true : d.statusConferencia === 'REJEITADA' ? false : null}>2. Conferencia: {d.statusConferencia}</Chip>
      <Chip ok={d.statusCompra === 'APROVADA' ? true : null}>3. Compra: {d.statusCompra}</Chip>
      <Chip ok={d.recebimentoFisicoEm ? true : null}>4. Recebimento fisico: {d.recebimentoFisicoEm ? formatarDataHora(d.recebimentoFisicoEm) : 'pendente'}</Chip>
      <Chip ok={d.statusEstoque === 'APLICADO' ? true : d.statusEstoque === 'FALHA' ? false : null}>5. Estoque: {d.statusEstoque}</Chip>
      <Chip ok={null}>Custo/preco: fora deste modulo</Chip>
    </div>
  );
}

export default function DocumentosFiscais() {
  const { usuario } = useAuth();
  const gerencia = usuario?.papel === 'ADMIN' || usuario?.papel === 'GERENTE';
  const [aba, setAba] = useState<'documentos' | 'fila'>('documentos');
  const [docs, setDocs] = useState<NfeDocumento[]>([]);
  const [fila, setFila] = useState<NfeRevisao[]>([]);
  const [sel, setSel] = useState<NfeDocumento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [resumoUpload, setResumoUpload] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function carregar(manterSel = true) {
    setCarregando(true);
    try {
      const [l, f] = await Promise.all([nfeApi.listar(), nfeApi.fila()]);
      setDocs(l.data);
      setFila(f.data);
      if (manterSel && sel) setSel(await nfeApi.detalhe(sel.id));
    } catch (e: any) { alert(e.message); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(false); /* eslint-disable-next-line */ }, []);

  async function abrir(id: string) {
    try { setSel(await nfeApi.detalhe(id)); } catch (e: any) { alert(e.message); }
  }

  async function agir(fn: () => Promise<unknown>) {
    setOcupado(true);
    try { await fn(); await carregar(); } catch (e: any) { alert(e.message + (e.detalhes ? '\n' + JSON.stringify(e.detalhes) : '')); }
    finally { setOcupado(false); }
  }

  async function enviar(files: FileList | null) {
    if (!files || !files.length) return;
    setOcupado(true);
    try {
      const r = await nfeApi.upload(Array.from(files));
      setResumoUpload(r.resultados.map((x: any) => `${x.nome}: ${x.erro ? `${x.erro.codigo} - ${x.erro.mensagem}` : x.duplicado ? 'ja recebido anteriormente' : `${x.status} (${x.metodo ?? 'sem metodo'})${x.acao ? ` [${x.acao}]` : ''}`}`));
      await carregar();
    } catch (e: any) { alert(e.message); }
    finally { setOcupado(false); if (input.current) input.current.value = ''; }
  }

  if (carregando && !docs.length) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-azul animate-spin" /></div>;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos fiscais (NF-e)</h1>
          <p className="text-sm text-gray-500">Receba, confira e aprove. Nada altera estoque antes da aprovacao E do recebimento fisico; custo e preco nao sao alterados aqui.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => carregar()} className="inline-flex items-center gap-2 border px-3 py-2 rounded text-sm" disabled={ocupado}><RefreshCw className="w-4 h-4" /> Atualizar</button>
          {gerencia && (
            <>
              <input ref={input} type="file" multiple accept=".xml,.pdf,.png,.jpg,.jpeg,application/xml,text/xml,application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => enviar(e.target.files)} />
              <button onClick={() => input.current?.click()} disabled={ocupado} className="inline-flex items-center gap-2 bg-azul text-white px-4 py-2 rounded text-sm">
                <Upload className="w-4 h-4" /> Enviar XML / PDF / imagem
              </button>
            </>
          )}
        </div>
      </div>

      {resumoUpload.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm">
          <strong>Resultado do envio</strong>
          <ul className="list-disc ml-5">{resumoUpload.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      <div className="flex gap-2 mb-3 border-b">
        {(['documentos', 'fila'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} className={`px-4 py-2 text-sm -mb-px border-b-2 ${aba === a ? 'border-azul text-azul font-semibold' : 'border-transparent text-gray-600'}`}>
            {a === 'documentos' ? `Documentos (${docs.length})` : `Fila de revisao (${fila.length})`}
          </button>
        ))}
      </div>

      {aba === 'documentos' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600"><tr>
                <th className="text-left px-3 py-2">Emitente</th><th className="text-left px-3 py-2">NF</th><th className="text-right px-3 py-2">Total</th><th className="text-left px-3 py-2">Situacao</th>
              </tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} onClick={() => abrir(d.id)} className={`border-t cursor-pointer hover:bg-blue-50 ${sel?.id === d.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">{d.emitenteNome ?? d.emitenteCnpj ?? '-'}<div className="text-xs text-gray-500">{formatarData(d.dataEmissao)}</div></td>
                    <td className="px-3 py-2">{d.numero}/{d.serie}<div className="text-xs text-gray-500">{d.fonteDados}</div></td>
                    <td className="px-3 py-2 text-right">{formatarCentavos(d.valorTotalCentavos)}</td>
                    <td className="px-3 py-2 text-xs">{d.statusConferencia} / {d.statusCompra} / {d.statusEstoque}{(d.pendenciasAbertas ?? 0) > 0 && <span className="ml-1 text-red-700 font-semibold">({d.pendenciasAbertas} pend.)</span>}</td>
                  </tr>
                ))}
                {!docs.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">Nenhum documento recebido ainda.</td></tr>}
              </tbody>
            </table>
          </div>
          {sel ? <Detalhe d={sel} gerencia={gerencia} ocupado={ocupado} agir={agir} /> : <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500 flex flex-col items-center gap-2"><FileText className="w-8 h-8" />Selecione um documento para conferir.</div>}
        </div>
      )}

      {aba === 'fila' && (
        <div className="bg-white rounded-lg shadow divide-y">
          {fila.map((r) => (
            <div key={r.id} className="p-3 flex flex-wrap justify-between gap-2 text-sm">
              <div>
                <span className={`font-semibold ${r.severidade === 'BLOQUEANTE' ? 'text-red-700' : 'text-amber-700'}`}>{r.motivo}</span>
                <span className="ml-2 text-xs text-gray-500">{r.entidadeTipo}</span>
                <div className="text-gray-700">{r.detalhe}</div>
              </div>
              <div className="flex gap-2 items-start">
                {r.documentoId && <button className="text-azul underline" onClick={() => { setAba('documentos'); abrir(r.documentoId!); }}>Abrir documento</button>}
                {gerencia && <button className="border px-2 py-1 rounded" disabled={ocupado} onClick={() => { const o = prompt('Observacao obrigatoria (minimo 5 caracteres) para ACEITAR este item:'); if (o) agir(() => nfeApi.resolver(r.id, 'ACEITAR', o)); }}>Aceitar...</button>}
              </div>
            </div>
          ))}
          {!fila.length && <div className="p-8 text-center text-gray-500">Fila vazia.</div>}
        </div>
      )}
    </div>
  );
}

function Detalhe({ d, gerencia, ocupado, agir }: { d: NfeDocumento; gerencia: boolean; ocupado: boolean; agir: (fn: () => Promise<unknown>) => Promise<void> }) {
  const abertas = (d.revisoes ?? []).filter((r) => r.status === 'ABERTO');
  const bloqueantes = abertas.filter((r) => r.severidade === 'BLOQUEANTE');
  const aprovada = d.statusCompra === 'APROVADA';
  const rejeitada = d.statusConferencia === 'REJEITADA';
  const [recebidas, setRecebidas] = useState<Record<string, string>>({});
  const [motivoDiv, setMotivoDiv] = useState('');
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [fornecedores, setFornecedores] = useState<any[]>([]);

  async function buscarFornecedor() {
    try { setFornecedores((await nfeApi.fornecedores(buscaFornecedor || d.emitenteCnpj || '')).data); } catch (e: any) { alert(e.message); }
  }

  const elegiveis = (d.itens ?? []).filter((i) => i.produtoId && ['MAPEADO', 'CONFIRMADO'].includes(i.statusVinculo));

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4 text-sm">
      <div>
        <h2 className="font-bold text-lg">NF-e {d.numero}/{d.serie} - {d.emitenteNome}</h2>
        <div className="text-xs text-gray-500 break-all">Chave: {d.chaveAcesso ?? 'nao identificada'} {d.chaveAcesso && <Chip ok={d.chaveValida}>{d.chaveValida ? 'DV valido' : 'chave INVALIDA'}</Chip>}</div>
        <div className="mt-1">Fonte: <Chip ok={d.fonteDados === 'XML'}>{FONTE_ROTULO[d.fonteDados] ?? d.fonteDados}</Chip></div>
      </div>
      <Etapas d={d} />

      {!d.fornecedorId && gerencia && !aprovada && (
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <div className="font-semibold text-red-800">Fornecedor nao cadastrado (CNPJ {d.emitenteCnpj})</div>
          <p className="text-xs mb-2">O sistema nao cadastra fornecedor sozinho. Cadastre em Fornecedores ou vincule a um existente:</p>
          <div className="flex gap-2">
            <input className="border rounded px-2 py-1 flex-1" placeholder="Buscar fornecedor" value={buscaFornecedor} onChange={(e) => setBuscaFornecedor(e.target.value)} />
            <button className="border px-3 rounded" onClick={buscarFornecedor}>Buscar</button>
          </div>
          {fornecedores.map((f) => <button key={f.id} className="block w-full text-left px-2 py-1 mt-1 hover:bg-white rounded border" onClick={() => agir(() => nfeApi.vincularFornecedor(d.id, f.id))}>{f.razaoSocial} {f.cnpj ? `(${f.cnpj})` : ''}</button>)}
        </div>
      )}
      {d.fornecedor && <div>Fornecedor: <strong>{d.fornecedor.razaoSocial}</strong></div>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600"><tr><th className="text-left p-1">#</th><th className="text-left p-1">Item</th><th className="text-right p-1">Qtd</th><th className="text-right p-1">Unit. (original)</th><th className="text-right p-1">Total</th><th className="text-left p-1">Produto</th></tr></thead>
          <tbody>
            {(d.itens ?? []).map((i) => (
              <ItemLinha key={i.id} i={i} podeEditar={gerencia && !aprovada && !rejeitada} agir={agir} ocupado={ocupado}
                receber={aprovada && !d.recebimentoFisicoEm && gerencia ? { valor: recebidas[i.id] ?? '', set: (v) => setRecebidas({ ...recebidas, [i.id]: v }) } : null} />
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="font-semibold mb-1">Pendencias ({abertas.length} abertas)</div>
        {(d.revisoes ?? []).map((r) => (
          <div key={r.id} className="flex gap-2 items-start text-xs py-1 border-t">
            {r.status !== 'ABERTO' ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : r.severidade === 'BLOQUEANTE' ? <XCircle className="w-4 h-4 text-red-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            <div className="flex-1"><strong>{r.motivo}</strong> <span className="text-gray-500">[{r.status}]</span><div>{r.detalhe}</div>{r.resolucao && <div className="text-gray-500">Decisao: {r.resolucao}</div>}</div>
            {gerencia && r.status === 'ABERTO' && !aprovada && <button className="border px-2 rounded" disabled={ocupado} onClick={() => { const o = prompt('Observacao (min. 5 caracteres) para aceitar:'); if (o) agir(() => nfeApi.resolver(r.id, 'ACEITAR', o)); }}>Aceitar</button>}
          </div>
        ))}
      </div>

      {gerencia && !rejeitada && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <button className="border px-3 py-1 rounded" disabled={ocupado} onClick={() => agir(() => nfeApi.reconciliar(d.id))}>Reprocessar conferencia</button>
          {!aprovada && (
            <>
              <button className="bg-green-700 text-white px-3 py-1 rounded disabled:opacity-40" disabled={ocupado || bloqueantes.length > 0 || d.statusCompra !== 'PREPARADA'}
                onClick={() => { const alertas = abertas.length - bloqueantes.length; if (!confirm(`Aprovar esta NF-e?\n\nIsto NAO movimenta estoque e NAO altera custo/preco.${alertas ? `\nHa ${alertas} alerta(s) aberto(s) que serao registrados como aceitos por voce.` : ''}`)) return; agir(() => nfeApi.aprovar(d.id, undefined, true)); }}>
                Aprovar compra
              </button>
              <button className="bg-red-700 text-white px-3 py-1 rounded" disabled={ocupado} onClick={() => { const m = prompt('Motivo da rejeicao (min. 5 caracteres):'); if (m) agir(() => nfeApi.rejeitar(d.id, m)); }}>Rejeitar</button>
            </>
          )}
          {aprovada && !d.recebimentoFisicoEm && (
            <div className="w-full space-y-2 bg-amber-50 border border-amber-200 rounded p-3">
              <div className="font-semibold">Confirmar recebimento fisico</div>
              <p className="text-xs">Confira a mercadoria. Se recebeu exatamente o da nota (e as unidades coincidem), use recebimento integral; senao informe a quantidade de cada item na coluna acima, na UNIDADE DO PRODUTO.</p>
              <input className="border rounded px-2 py-1 w-full" placeholder="Motivo da divergencia (obrigatorio se a quantidade ou unidade diferir)" value={motivoDiv} onChange={(e) => setMotivoDiv(e.target.value)} />
              <div className="flex gap-2">
                <button className="bg-azul text-white px-3 py-1 rounded" disabled={ocupado} onClick={() => agir(() => nfeApi.confirmarRecebimento(d.id, { recebimentoIntegral: true }))}>Recebimento integral</button>
                <button className="border px-3 py-1 rounded" disabled={ocupado} onClick={() => agir(() => nfeApi.confirmarRecebimento(d.id, { itens: elegiveis.map((i) => ({ itemId: i.id, quantidadeRecebida: Number((recebidas[i.id] ?? '').replace(',', '.')) })), motivoDivergencia: motivoDiv || undefined }))}>Enviar quantidades informadas</button>
              </div>
            </div>
          )}
          {d.statusEstoque === 'FALHA' && <button className="bg-amber-600 text-white px-3 py-1 rounded" disabled={ocupado} onClick={() => agir(() => nfeApi.aplicarEstoque(d.id))}>Repetir atualizacao de estoque</button>}
        </div>
      )}

      <details>
        <summary className="cursor-pointer font-semibold">Historico de processamento ({d.historico?.length ?? 0})</summary>
        <ul className="text-xs mt-1 space-y-0.5">{(d.historico ?? []).map((h) => <li key={h.id}><span className="text-gray-500">{formatarDataHora(h.criadoEm)}</span> <strong className={h.status === 'ERROR' ? 'text-red-700' : h.status === 'WARN' ? 'text-amber-700' : ''}>{h.acao}</strong> {h.mensagem}</li>)}</ul>
      </details>
    </div>
  );
}

function ItemLinha({ i, podeEditar, agir, ocupado, receber }: { i: NfeItem; podeEditar: boolean; agir: (fn: () => Promise<unknown>) => Promise<void>; ocupado: boolean; receber: { valor: string; set: (v: string) => void } | null }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [aberto, setAberto] = useState(false);
  async function procurar() {
    try { setResultados((await nfeApi.produtos(busca || i.descricao || '')).data); setAberto(true); } catch (e: any) { alert(e.message); }
  }
  const resolvido = ['MAPEADO', 'CONFIRMADO', 'DISPENSADO'].includes(i.statusVinculo);
  return (
    <>
      <tr className="border-t align-top">
        <td className="p-1">{i.numeroItem}</td>
        <td className="p-1">{i.descricao}<div className="text-gray-500">cod {i.codigoFornecedor} - NCM {i.ncm ?? '?'} - CFOP {i.cfop ?? '?'}</div></td>
        <td className="p-1 text-right">{i.quantidadeOriginal} {i.unidade}{receber && <input className="border rounded w-20 ml-1 px-1 text-right" placeholder="recebido" value={receber.valor} onChange={(e) => receber.set(e.target.value)} />}{i.quantidadeRecebida !== null && <div className="text-green-700">recebido {i.quantidadeRecebida}</div>}</td>
        <td className="p-1 text-right">{i.valorUnitarioOriginal}</td>
        <td className="p-1 text-right">{formatarCentavos(i.valorTotalCentavos)}</td>
        <td className="p-1">
          <Chip ok={resolvido ? true : i.statusVinculo === 'SUGERIDO' ? null : false}>{i.statusVinculo}{i.vinculoOrigem ? ` (${i.vinculoOrigem})` : ''}</Chip>
          {i.produto && <div>{i.produto.codigoInterno} - {i.produto.nome} <span className="text-gray-500">({i.produto.unidade}, saldo {i.produto.estoqueAtual})</span></div>}
          {podeEditar && (
            <div className="mt-1 flex gap-1">
              <button className="border px-1 rounded" disabled={ocupado} onClick={() => setAberto(!aberto)}>{i.produtoId ? 'Trocar' : 'Vincular'}</button>
              {i.statusVinculo !== 'DISPENSADO' && <button className="border px-1 rounded" disabled={ocupado} onClick={() => { const m = prompt('Motivo para NAO dar entrada deste item (min. 5 caracteres):'); if (m) agir(() => nfeApi.dispensarItem(i.id, m)); }}>Nao entra</button>}
            </div>
          )}
        </td>
      </tr>
      {aberto && podeEditar && (
        <tr><td colSpan={6} className="p-2 bg-gray-50">
          <div className="flex gap-2"><input className="border rounded px-2 py-1 flex-1" placeholder="Buscar produto cadastrado (nome, codigo, EAN)" value={busca} onChange={(e) => setBusca(e.target.value)} /><button className="border px-3 rounded" onClick={procurar}>Buscar</button></div>
          {resultados.map((p) => (
            <button key={p.id} className="block w-full text-left px-2 py-1 mt-1 hover:bg-white border rounded" onClick={() => agir(async () => { await nfeApi.vincularProduto(i.id, p.id, true); setAberto(false); })}>
              {p.codigoInterno} - {p.nome} <span className="text-gray-500">({p.unidade})</span>
            </button>
          ))}
          <p className="text-xs text-gray-500 mt-1">O vinculo cria o mapeamento codigo-do-fornecedor → produto para as proximas notas. Produto novo: cadastre em Produtos antes.</p>
        </td></tr>
      )}
    </>
  );
}
