import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;
let vendedorToken: string;

async function limparBanco() {
  // Limpa em ordem de dependência
  await prisma.movimentacaoEstoque.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.marca.deleteMany();
  await prisma.usuario.deleteMany();
}

async function criarUsuarios() {
  const adminHash = await bcrypt.hash('admin', 10);
  await prisma.usuario.create({
    data: { nome: 'Admin', login: 'admin', senhaHash: adminHash, papel: 'ADMIN', deveTrocarSenha: false },
  });
  const vendedorHash = await bcrypt.hash('ven123', 10);
  await prisma.usuario.create({
    data: { nome: 'Vendedor', login: 'vendedor', senhaHash: vendedorHash, papel: 'VENDEDOR', deveTrocarSenha: false },
  });
}

async function login(login: string, senha: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login, senha }),
  });
  return res.json().token;
}

async function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await limparBanco();
  await criarUsuarios();
  app = await buildApp({ logger: false });
  await app.ready();
  adminToken = await login('admin', 'admin');
  vendedorToken = await login('vendedor', 'ven123');
});

afterEach(async () => {
  await app.close();
});

test('1) GET /api/categorias lista vazia inicialmente', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/categorias',
    headers: await authHeader(adminToken),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 0);
});

test('2) POST /api/categorias com ADMIN → 201', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/categorias',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Tinta Acrilica', corHex: '#1E63B8' }),
  });
  assert.equal(res.statusCode, 201);
  const cat = res.json();
  assert.equal(cat.nome, 'Tinta Acrilica');
  assert.equal(cat.corHex, '#1E63B8');
  assert.equal(cat.ativo, true);
});

test('3) POST /api/categorias com VENDEDOR → 403', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/categorias',
    headers: { 'content-type': 'application/json', ...(await authHeader(vendedorToken)) },
    payload: JSON.stringify({ nome: 'Tinta Acrilica' }),
  });
  assert.equal(res.statusCode, 403);
});

test('4) POST /api/categorias com nome duplicado → 409', async () => {
  await app.inject({
    method: 'POST', url: '/api/categorias',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Tinta Acrilica' }),
  });
  const res = await app.inject({
    method: 'POST', url: '/api/categorias',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Tinta Acrilica' }),
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().erro, 'Nome ja existe');
});

test('5) POST /api/marcas com ADMIN → 201', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/marcas',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Suvinil' }),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().nome, 'Suvinil');
});

test('6) POST /api/produtos com ADMIN → 201', async () => {
  // Cria categoria e marca primeiro
  const cat = (await app.inject({
    method: 'POST', url: '/api/categorias',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Tinta Acrilica' }),
  })).json();
  const marca = (await app.inject({
    method: 'POST', url: '/api/marcas',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ nome: 'Suvinil' }),
  })).json();

  const res = await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({
      codigoInterno: 'P001',
      codigoBarras: '7891234567890',
      nome: 'Tinta Acrilica Branca 18L',
      marcaId: marca.id,
      categoriaId: cat.id,
      unidade: 'LATAS',
      precoCustoCentavos: 28500,
      precoVendaCentavos: 39900,
    }),
  });
  assert.equal(res.statusCode, 201);
  const prod = res.json();
  assert.equal(prod.nome, 'Tinta Acrilica Branca 18L');
  assert.equal(prod.codigoInterno, 'P001');
  assert.equal(prod.marca.nome, 'Suvinil');
  assert.equal(prod.categoria.nome, 'Tinta Acrilica');
  assert.ok(prod.margemPercentual > 0);
});

test('7) POST /api/produtos com VENDEDOR → 403', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(vendedorToken)) },
    payload: JSON.stringify({ codigoInterno: 'P001', nome: 'Produto' }),
  });
  assert.equal(res.statusCode, 403);
});

test('8) GET /api/produtos lista paginada', async () => {
  // Cria 2 produtos
  for (const codigo of ['P001', 'P002']) {
    await app.inject({
      method: 'POST', url: '/api/produtos',
      headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
      payload: JSON.stringify({ codigoInterno: codigo, nome: `Produto ${codigo}`, precoVendaCentavos: 1000 }),
    });
  }
  const res = await app.inject({
    method: 'GET', url: '/api/produtos',
    headers: await authHeader(adminToken),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.length, 2);
  assert.equal(body.total, 2);
});

test('9) GET /api/produtos com busca', async () => {
  await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ codigoInterno: 'P001', nome: 'Tinta Branca' }),
  });
  await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ codigoInterno: 'P002', nome: 'Rolo de Pelo' }),
  });
  const res = await app.inject({
    method: 'GET', url: '/api/produtos?busca=Tinta',
    headers: await authHeader(adminToken),
  });
  assert.equal(res.json().total, 1);
  assert.equal(res.json().data[0].nome, 'Tinta Branca');
});

test('10) POST /api/produtos/importar CSV — cria produtos por nome de marca/categoria', async () => {
  const csv = `codigoInterno,nome,marcaNome,categoriaNome,precoCustoCentavos,precoVendaCentavos,estoqueAtual
P001,Tinta Acrilica Branca,Suvinil,Tinta Acrilica,28500,39900,10
P002,Tinta Acrilica Azul,Suvinil,Tinta Acrilica,28500,39900,5
P003,Rolo de Pelo,,Acessorios,1500,2990,20`;

  const res = await app.inject({
    method: 'POST', url: '/api/produtos/importar',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ csv }),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.criados, 3);
  assert.equal(body.erros, 0);

  // Verifica que a marca foi criada
  const suvinil = await prisma.marca.findFirst({ where: { nome: 'Suvinil' } });
  assert.ok(suvinil, 'Marca Suvinil deveria ter sido criada');
  // Verifica que categoria foi criada
  const cat = await prisma.categoria.findFirst({ where: { nome: 'Tinta Acrilica' } });
  assert.ok(cat);
  // Verifica que produtos estao no banco
  const total = await prisma.produto.count();
  assert.equal(total, 3);
});

test('11) POST /api/produtos/importar CSV — atualiza existentes (mesmo codigoInterno)', async () => {
  // Cria produto existente
  await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ codigoInterno: 'P001', nome: 'Tinta Antiga', precoVendaCentavos: 1000 }),
  });

  const csv = `codigoInterno,nome,precoVendaCentavos
P001,Tinta Nova,2000`;

  const res = await app.inject({
    method: 'POST', url: '/api/produtos/importar',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ csv }),
  });
  const body = res.json();
  assert.equal(body.criados, 0);
  assert.equal(body.atualizados, 1);
  assert.equal(body.erros, 0);

  // Verifica que foi atualizado
  const p = await prisma.produto.findUnique({ where: { codigoInterno: 'P001' } });
  assert.equal(p!.nome, 'Tinta Nova');
  assert.equal(p!.precoVendaCentavos, 2000);
});

test('12) DELETE /api/produtos desativa (soft delete)', async () => {
  const prod = (await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({ codigoInterno: 'P001', nome: 'Produto' }),
  })).json();
  const res = await app.inject({
    method: 'DELETE', url: `/api/produtos/${prod.id}`,
    headers: await authHeader(adminToken),
  });
  assert.equal(res.statusCode, 200);
  const p = await prisma.produto.findUnique({ where: { id: prod.id } });
  assert.equal(p!.ativo, false);
});

test('13) POST /api/produtos com preco de venda < custo → erro', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/produtos',
    headers: { 'content-type': 'application/json', ...(await authHeader(adminToken)) },
    payload: JSON.stringify({
      codigoInterno: 'P001', nome: 'Produto',
      precoCustoCentavos: 5000, precoVendaCentavos: 3000,
    }),
  });
  assert.equal(res.statusCode, 400);
});
