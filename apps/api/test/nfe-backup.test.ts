// Backup/restauracao (B17) com as tabelas da Fase 5: ida e volta com dados de NF-e,
// compatibilidade com backup antigo (sem tabelas de NF-e) e integridade referencial.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { auth, criarFornecedor, criarProduto, criarUsuarios, limparBancoNfe, login, upload } from './helpers/app-helpers.js';
import { CNPJ_FORNECEDOR, CNPJ_LOJA, montarXmlNfe } from './helpers/nfe-fixtures.js';

let app: FastifyInstance;
let admin: string;
let gerente: string;

before(async () => {
  process.env.LOJA_CNPJ = CNPJ_LOJA;
  await limparBancoNfe();
  await criarUsuarios();
  await prisma.configuracao.upsert({ where: { id: 'unica' }, update: {}, create: { id: 'unica' } });
  app = await buildApp({ logger: false });
  await app.ready();
  admin = await login(app, 'admin', 'admin-123');
  gerente = await login(app, 'gerente', 'ger-123');
});
after(async () => { await app.close(); await limparBancoNfe(); });

const contagens = async () => ({
  email: await prisma.emailMensagem.count(), arquivo: await prisma.documentoArquivo.count(), doc: await prisma.nfeDocument.count(),
  item: await prisma.nfeItem.count(), mapa: await prisma.produtoFornecedorMap.count(), revisao: await prisma.reviewQueueItem.count(), log: await prisma.processingLog.count(),
});

test('backup exporta e restaura NF-e (documento, itens, mapa, revisao, historico) respeitando FKs', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Tinta', custo: 1000, estoque: 2 });
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '1', produtoId: p.id } });
  const up = await upload(app, gerente, 'n.xml', 'text/xml', Buffer.from(montarXmlNfe({ numero: 900, itens: [{ codigo: '1', quantidade: '2.0000', valorUnitario: '10.0000000000' }, { codigo: '2', quantidade: '1.0000', valorUnitario: '5.0000000000' }] }).xml));
  const docId = up.corpo.resultados[0].documentoIds[0] as string;
  const antes = await contagens();
  assert.ok(antes.doc === 1 && antes.item === 2 && antes.mapa === 1 && antes.revisao >= 1 && antes.log >= 1 && antes.arquivo === 1);
  const docAntes = await prisma.nfeDocument.findUniqueOrThrow({ where: { id: docId }, include: { itens: { orderBy: { numeroItem: 'asc' } } } });

  const exp = await app.inject({ method: 'GET', url: '/api/backup/exportar', headers: auth(admin) });
  assert.equal(exp.statusCode, 200);
  const snapshot = exp.json() as any;
  for (const t of ['nfeDocument', 'nfeItem', 'produtoFornecedorMap', 'reviewQueueItem', 'processingLog', 'documentoArquivo', 'emailMensagem']) {
    assert.ok(Array.isArray(snapshot.data[t]), `exportacao deve conter ${t}`);
  }
  assert.equal(snapshot.data.nfeDocument.length, 1);

  // muda o estado depois do snapshot (apaga os dados de NF-e)
  await prisma.processingLog.deleteMany();
  await prisma.reviewQueueItem.deleteMany();
  await prisma.nfeItem.deleteMany();
  await prisma.produtoFornecedorMap.deleteMany();
  await prisma.nfeDocument.deleteMany();
  assert.equal((await contagens()).doc, 0);

  const rest = await app.inject({ method: 'POST', url: '/api/backup/restaurar', headers: { ...auth(admin), 'content-type': 'application/json' }, payload: JSON.stringify(snapshot) });
  assert.equal(rest.statusCode, 200, rest.body);
  const depois = await contagens();
  assert.deepEqual(depois, antes);
  const docDepois = await prisma.nfeDocument.findUniqueOrThrow({ where: { id: docId }, include: { itens: { orderBy: { numeroItem: 'asc' } } } });
  assert.equal(docDepois.chaveAcesso, docAntes.chaveAcesso);
  assert.equal(docDepois.dataEmissao?.toISOString(), docAntes.dataEmissao?.toISOString(), 'datas restauradas como Date');
  assert.equal(docDepois.criadoEm.toISOString(), docAntes.criadoEm.toISOString());
  assert.deepEqual(docDepois.itens.map((i) => [i.codigoFornecedor, i.valorUnitarioOriginal, i.statusVinculo, i.produtoId]), docAntes.itens.map((i) => [i.codigoFornecedor, i.valorUnitarioOriginal, i.statusVinculo, i.produtoId]));
  assert.equal(docDepois.itens[0].produtoId, p.id);
});

test('backup antigo (sem tabelas de NF-e) ainda restaura: limpa NF-e sem violar FK e nao exige as novas tabelas', async () => {
  const exp = (await app.inject({ method: 'GET', url: '/api/backup/exportar', headers: auth(admin) })).json() as any;
  const antigo = { ...exp, data: { ...exp.data } };
  for (const t of ['nfeDocument', 'nfeItem', 'produtoFornecedorMap', 'reviewQueueItem', 'processingLog', 'documentoArquivo', 'emailMensagem']) delete antigo.data[t];
  assert.equal((await contagens()).doc, 1);
  const rest = await app.inject({ method: 'POST', url: '/api/backup/restaurar', headers: { ...auth(admin), 'content-type': 'application/json' }, payload: JSON.stringify(antigo) });
  assert.equal(rest.statusCode, 200, rest.body);
  const c = await contagens();
  assert.equal(c.doc, 0);
  assert.equal(c.item, 0);
  assert.equal(await prisma.produto.count(), 1, 'dados antigos restaurados');
});

test('restauracao incompleta de tabelas OBRIGATORIAS continua sendo recusada (regra B17 preservada)', async () => {
  const exp = (await app.inject({ method: 'GET', url: '/api/backup/exportar', headers: auth(admin) })).json() as any;
  const quebrado = { ...exp, data: { ...exp.data } };
  delete quebrado.data.produto;
  const rest = await app.inject({ method: 'POST', url: '/api/backup/restaurar', headers: { ...auth(admin), 'content-type': 'application/json' }, payload: JSON.stringify(quebrado) });
  assert.equal(rest.statusCode, 400);
  assert.match((rest.json() as any).erro, /incompleto/i);
});
