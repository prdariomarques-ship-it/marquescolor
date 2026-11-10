// Verificacoes de seguranca/qualidade da Fase 5: concorrencia no estoque, integridade do
// original, XML hostil (tamanho, aninhamento, entidades), idempotencia por SHA-256.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { nfeConfig } from '../src/modules/nfe/config.js';
import { lerNfeXml } from '../src/modules/nfe/xml-parser.js';
import { auth, criarFornecedor, criarProduto, criarUsuarios, limparBancoNfe, login, upload } from './helpers/app-helpers.js';
import { CNPJ_FORNECEDOR, CNPJ_LOJA, montarXmlNfe } from './helpers/nfe-fixtures.js';

let app: FastifyInstance;
let gerente: string;

before(async () => {
  process.env.LOJA_CNPJ = CNPJ_LOJA;
  await limparBancoNfe();
  await criarUsuarios();
  app = await buildApp({ logger: false });
  await app.ready();
  gerente = await login(app, 'gerente', 'ger-123');
});
after(async () => { await app.close(); await limparBancoNfe(); });
beforeEach(async () => {
  for (const t of ['processingLog', 'reviewQueueItem', 'nfeItem', 'produtoFornecedorMap', 'nfeDocument', 'documentoArquivo', 'emailMensagem', 'itemCompra', 'compra', 'movimentacaoEstoque', 'produto', 'fornecedor'] as const) await (prisma as any)[t].deleteMany();
});
const post = (url: string, payload: unknown = {}) => app.inject({ method: 'POST', url, headers: { ...auth(gerente), 'content-type': 'application/json' }, payload: JSON.stringify(payload) });

async function aprovada(estoque = 0) {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Tinta', custo: 1000, estoque });
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '1', produtoId: p.id } });
  const r = (await upload(app, gerente, 'n.xml', 'text/xml', Buffer.from(montarXmlNfe({ numero: 3001, itens: [{ codigo: '1', quantidade: '10.0000', valorUnitario: '10.0000000000' }] }).xml))).corpo.resultados[0];
  const docId = r.documentoIds[0] as string;
  assert.equal((await post(`/api/nfe/documentos/${docId}/aprovar`, { reconheceAlertas: true })).statusCode, 200);
  return { p, docId, arquivoId: r.arquivoId as string };
}

test('concorrencia: varias confirmacoes de recebimento simultaneas dao entrada UMA unica vez', async () => {
  const { p, docId } = await aprovada(5);
  const resp = await Promise.all(Array.from({ length: 6 }, () => post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, { recebimentoIntegral: true })));
  const codigos = resp.map((r) => r.statusCode);
  // cada chamada ou aplicou, ou reconheceu que ja foi aplicado, ou perdeu a corrida (409/5xx) — nunca duplica
  assert.ok(codigos.some((c) => c === 200), `ao menos uma deve concluir: ${codigos}`);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 15, `estoque deve subir uma vez so (respostas ${codigos})`);
  assert.equal(await prisma.movimentacaoEstoque.count(), 1);
  assert.equal(await prisma.compra.count(), 1);
  // e o estado final e consistente
  const d = await prisma.nfeDocument.findUniqueOrThrow({ where: { id: docId } });
  assert.equal(d.statusEstoque, 'APLICADO');
  // uma chamada posterior e simplesmente idempotente
  assert.equal(((await post(`/api/nfe/documentos/${docId}/aplicar-estoque`)).json() as any).jaAplicado, true);
});

test('original adulterado no disco: reprocessar recusa (SHA-256) e nao altera nada', async () => {
  const { arquivoId, docId } = await aprovada();
  const a = await prisma.documentoArquivo.findUniqueOrThrow({ where: { id: arquivoId } });
  await writeFile(path.join(nfeConfig().storageDir, ...a.caminho.split('/')), Buffer.from('<adulterado/>'));
  const r = await post(`/api/nfe/arquivos/${arquivoId}/reprocessar`);
  assert.equal(r.statusCode, 409);
  assert.match((r.json() as any).erro, /Integridade/);
  assert.equal((await prisma.nfeDocument.findUniqueOrThrow({ where: { id: docId } })).statusCompra, 'APROVADA');
});

test('XML hostil: bilhao de risadas/entidades externas, tamanho excessivo e aninhamento profundo nao derrubam nem expandem', async () => {
  const bomba = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><NFe><infNFe Id="NFe1">&lol2;</infNFe></NFe>';
  const xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///C:/Windows/win.ini">]><NFe><infNFe Id="NFe1">&e;</infNFe></NFe>';
  for (const x of [bomba, xxe]) assert.throws(() => lerNfeXml(Buffer.from(x)), (e: any) => e.codigo === 'XML_PERIGOSO');
  const grande = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
  grande.write('<NFe/>', 0);
  assert.throws(() => lerNfeXml(grande), (e: any) => e.codigo === 'XML_PERIGOSO');
  const fundo = `<NFe>${'<a>'.repeat(20000)}${'</a>'.repeat(20000)}</NFe>`;
  let resultado = 'nao-lancou';
  try { lerNfeXml(Buffer.from(fundo)); } catch (e: any) { resultado = e?.name ?? 'erro'; }
  assert.notEqual(resultado, 'nao-lancou'); // nao e uma NF-e valida; o importante e nao travar/derrubar o processo
  // via HTTP: vira falha registrada, nunca excecao nao tratada
  const r = (await upload(app, gerente, 'bomba.xml', 'text/xml', Buffer.from(bomba))).corpo.resultados[0];
  assert.equal(r.status, 'FALHA');
  assert.equal(r.erro.codigo, 'XML_PERIGOSO');
  const r2 = (await upload(app, gerente, 'fundo.xml', 'text/xml', Buffer.from(fundo))).corpo.resultados[0];
  assert.equal(r2.status, 'FALHA');
  assert.equal(await prisma.nfeDocument.count(), 0);
});

test('idempotencia SHA-256: reenviar N vezes o mesmo arquivo nunca cria novo arquivo, documento ou log de estoque', async () => {
  const { docId } = await aprovada();
  const bytes = Buffer.from(montarXmlNfe({ numero: 3001, itens: [{ codigo: '1', quantidade: '10.0000', valorUnitario: '10.0000000000' }] }).xml);
  for (let i = 0; i < 4; i++) {
    const r = (await upload(app, gerente, `n${i}.xml`, 'text/xml', bytes)).corpo.resultados[0];
    assert.equal(r.duplicado, true);
    assert.deepEqual(r.documentoIds, [docId]);
  }
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.equal(await prisma.nfeDocument.count(), 1);
  assert.equal(await prisma.movimentacaoEstoque.count(), 0);
});
