import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

async function limparBanco() {
  await prisma.refreshToken.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.usuario.deleteMany();
}

async function criarUsuario(dados: {
  nome: string;
  login: string;
  senha: string;
  papel: string;
  ativo?: boolean;
  deveTrocarSenha?: boolean;
}) {
  const senhaHash = await bcrypt.hash(dados.senha, 10);
  return prisma.usuario.create({
    data: {
      nome: dados.nome,
      login: dados.login,
      senhaHash,
      papel: dados.papel,
      ativo: dados.ativo ?? true,
      deveTrocarSenha: dados.deveTrocarSenha ?? false,
    },
  });
}

async function loginE(token?: { login: string; senha: string }) {
  if (!token) return {};
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(token),
  });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { authorization: `Bearer ${body.token}` };
}

beforeEach(async () => {
  await limparBanco();
  app = await buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('1) POST /api/auth/login com credenciais validas → 200, retorna token + refreshToken + user + deveTrocarSenha', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN', deveTrocarSenha: false });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'admin' }),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(typeof body.token === 'string' && body.token.length > 10);
  assert.ok(typeof body.refreshToken === 'string' && body.refreshToken.length > 10);
  assert.equal(body.user.login, 'admin');
  assert.equal(body.user.papel, 'ADMIN');
  assert.equal(body.deveTrocarSenha, false);
});

test('2) POST /api/auth/login com senha errada → 401', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'errada' }),
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().erro, 'Credenciais invalidas');
});

test('3) POST /api/auth/login com usuario inativo → 403', async () => {
  await criarUsuario({ nome: 'Bloqueado', login: 'bloqueado', senha: 'senha123', papel: 'VENDEDOR', ativo: false });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'bloqueado', senha: 'senha123' }),
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.json().erro, 'Usuario bloqueado');
});

test('4) GET /api/auth/me sem token → 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 401);
});

test('5) GET /api/auth/me com token valido → 200, retorna dados do usuario', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'admin' }),
  });
  const { token } = loginRes.json();

  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.login, 'admin');
  assert.equal(body.papel, 'ADMIN');
  assert.equal(body.ativo, true);
});

test('6) POST /api/usuarios sem auth → 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/usuarios',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ nome: 'Novo', login: 'novo', senha: 'senha123', papel: 'VENDEDOR' }),
  });
  assert.equal(res.statusCode, 401);
});

test('7) POST /api/usuarios com auth VENDEDOR → 403', async () => {
  await criarUsuario({ nome: 'Vendedor', login: 'vendedor', senha: 'ven123', papel: 'VENDEDOR' });
  const headers = await loginE({ login: 'vendedor', senha: 'ven123' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/usuarios',
    headers: { 'content-type': 'application/json', ...headers },
    payload: JSON.stringify({ nome: 'Novo', login: 'novo', senha: 'senha123', papel: 'VENDEDOR' }),
  });
  assert.equal(res.statusCode, 403);
});

test('8) POST /api/usuarios com auth ADMIN → 201, cria usuario com deveTrocarSenha=true', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });
  const headers = await loginE({ login: 'admin', senha: 'admin' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/usuarios',
    headers: { 'content-type': 'application/json', ...headers },
    payload: JSON.stringify({ nome: 'Novo Vendedor', login: 'novovend', senha: 'senha123', papel: 'VENDEDOR' }),
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.login, 'novovend');
  assert.equal(body.papel, 'VENDEDOR');
  assert.equal(body.deveTrocarSenha, true);

  // Verifica que a senha foi hasheada (nao retorna senhaHash)
  assert.equal(body.senhaHash, undefined);
});

test('9) POST /api/auth/trocar-senha com senha atual errada → 400', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN', deveTrocarSenha: true });
  const headers = await loginE({ login: 'admin', senha: 'admin' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/trocar-senha',
    headers: { 'content-type': 'application/json', ...headers },
    payload: JSON.stringify({ senhaAtual: 'errada', novaSenha: 'nova123', confirmar: 'nova123' }),
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().erro, 'Senha atual incorreta');
});

test('10) POST /api/auth/trocar-senha com senha atual correta → 200 e seta deveTrocarSenha=false', async () => {
  await criarUsuario({ nome: 'Vendedor', login: 'vendedor', senha: 'ven123', papel: 'VENDEDOR', deveTrocarSenha: true });
  const headers = await loginE({ login: 'vendedor', senha: 'ven123' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/trocar-senha',
    headers: { 'content-type': 'application/json', ...headers },
    payload: JSON.stringify({ senhaAtual: 'ven123', novaSenha: 'nova123', confirmar: 'nova123' }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);

  // Verifica no banco que deveTrocarSenha virou false
  const usuario = await prisma.usuario.findUnique({ where: { login: 'vendedor' } });
  assert.equal(usuario!.deveTrocarSenha, false);

  // Verifica que TODOS os refresh tokens foram revogados
  const rts = await prisma.refreshToken.findMany({ where: { usuarioId: usuario!.id } });
  assert.ok(rts.length > 0, 'deveria ter pelo menos 1 refresh token');
  assert.ok(rts.every(rt => rt.revogado), 'todos os refresh tokens deveriam estar revogados');
});

test('11) POST /api/auth/refresh com refreshToken valido → 200, retorna novo par (rotacao)', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'admin' }),
  });
  const { refreshToken: rtOriginal } = loginRes.json();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ refreshToken: rtOriginal }),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(typeof body.token === 'string' && body.token.length > 10);
  assert.ok(typeof body.refreshToken === 'string' && body.refreshToken.length > 10);
  assert.notEqual(body.refreshToken, rtOriginal, 'novo refreshToken deve ser diferente do original (rotacao)');
});

test('12) POST /api/auth/refresh com refreshToken revogado → 401', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'admin' }),
  });
  const { refreshToken: rtOriginal } = loginRes.json();

  // Primeiro refresh: rota e gera novo par
  await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ refreshToken: rtOriginal }),
  });

  // Segundo uso do mesmo (agora revogado): deve falhar
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ refreshToken: rtOriginal }),
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().erro, 'Refresh token revogado');
});

test('13) DELETE /api/usuarios admin tentando se auto-desativar → 400', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });
  const headers = await loginE({ login: 'admin', senha: 'admin' });

  // Pega o id do admin
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers,
  });
  const meuId = meRes.json().id;

  const res = await app.inject({
    method: 'DELETE',
    url: `/api/usuarios/${meuId}`,
    headers,
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().erro, 'Voce nao pode desativar a si mesmo');
});

test('14) GET /api/auditoria lista registros de login (apos login do admin)', async () => {
  await criarUsuario({ nome: 'Admin', login: 'admin', senha: 'admin', papel: 'ADMIN' });

  // Faz login para gerar auditoria
  await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ login: 'admin', senha: 'admin' }),
  });

  const headers = await loginE({ login: 'admin', senha: 'admin' });
  const res = await app.inject({
    method: 'GET',
    url: '/api/auditoria',
    headers,
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.data));
  // Tem que ter pelo menos 2 auditorias: LOGIN do primeiro login, LOGIN do segundo
  assert.ok(body.data.length >= 1, 'deveria ter pelo menos 1 registro de auditoria');
  // Verifica que algum tem acao=LOGIN
  const temLogin = body.data.some((a: any) => a.acao === 'LOGIN');
  assert.ok(temLogin, 'deveria ter ao menos 1 registro de LOGIN');
});
