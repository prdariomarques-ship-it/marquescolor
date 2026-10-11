import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';

async function limparBanco() {
  await prisma.refreshToken.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.usuario.deleteMany();
}

async function seedAdmin() {
  const senhaHash = await bcrypt.hash('admin', 10);
  await prisma.usuario.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      nome: 'Administrador',
      login: 'admin',
      senhaHash,
      papel: 'ADMIN',
      deveTrocarSenha: false,
    },
  });
}

test('GET /api/health retorna loja e banco', async () => {
  await limparBanco();
  await seedAdmin();
  const app = await buildApp({ logger: false });
  try {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.banco, true);
    assert.equal(body.loja, 'Marquescollor Tintas');
    assert.ok(typeof body.hora === 'string');
  } finally {
    await app.close();
  }
});

test('CORS permite origem localhost:5173 (preflight)', async () => {
  await limparBanco();
  await seedAdmin();
  const app = await buildApp({ logger: false });
  try {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(res.statusCode, 204);
    const allowOrigin = res.headers['access-control-allow-origin'];
    assert.ok(
      typeof allowOrigin === 'string' && allowOrigin.includes('localhost:5173'),
      `esperado allow-origin contendo localhost:5173, recebido: ${allowOrigin}`,
    );
  } finally {
    await app.close();
  }
});

test('CORS bloqueia origem nao permitida', async () => {
  await limparBanco();
  await seedAdmin();
  const app = await buildApp({ logger: false });
  try {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://exemplo.local',
        'access-control-request-method': 'GET',
      },
    });
    // Origin nao permitida: o @fastify/cors nao envia Allow-Origin e retorna 204
    // sem os headers CORS. Aqui validamos que nao recebeu allow-origin.
    const allowOrigin = res.headers['access-control-allow-origin'];
    assert.ok(
      !allowOrigin || !allowOrigin.includes('exemplo.local'),
      `esperado SEM allow-origin para exemplo.local, recebido: ${allowOrigin}`,
    );
  } finally {
    await app.close();
  }
});
