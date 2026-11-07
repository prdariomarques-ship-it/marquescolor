import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

test('B17: metas persistem, exportacao filtrada responde e backup restaura datas e dados', async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.metaMensal.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.configuracao.upsert({
    where: { id: 'unica' },
    update: { nomeLoja: 'Marquescollor Tintas' },
    create: { id: 'unica', nomeLoja: 'Marquescollor Tintas' },
  });

  const senhaHash = await bcrypt.hash('admin-teste-123', 4);
  const admin = await prisma.usuario.create({
    data: {
      nome: 'Administrador de Teste',
      login: 'admin-b17',
      senhaHash,
      papel: 'ADMIN',
      deveTrocarSenha: false,
    },
  });

  const app = await buildApp({ logger: false });
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'admin-b17', senha: 'admin-teste-123' },
    });
    assert.equal(login.statusCode, 200);
    const token = login.json().token as string;
    const headers = { authorization: `Bearer ${token}` };

    const salvarMeta = await app.inject({
      method: 'PUT',
      url: '/api/dashboard/metas',
      headers,
      payload: { valorMetaCentavos: 6500000, cenario: 'manual' },
    });
    assert.equal(salvarMeta.statusCode, 200);

    const lerMeta = await app.inject({
      method: 'GET',
      url: '/api/dashboard/metas',
      headers,
    });
    assert.equal(lerMeta.statusCode, 200);
    assert.equal(lerMeta.json().metaMensal.valorMetaCentavos, 6500000);

    const exportar = await app.inject({
      method: 'GET',
      url: '/api/vendas/exportar?dataInicio=2026-11-01&dataFim=2026-11-30',
      headers,
    });
    assert.equal(exportar.statusCode, 200);
    assert.ok(Array.isArray(exportar.json().vendas));

    const backup = await app.inject({
      method: 'GET',
      url: '/api/backup/exportar',
      headers,
    });
    assert.equal(backup.statusCode, 200);
    const payload = backup.json();
    assert.equal(payload.format, 'MARQUESCOLOR_BACKUP');
    assert.equal(payload.version, 1);
    assert.equal(payload.data.metaMensal.length, 1);
    assert.equal(payload.data.metaMensal[0].valorMetaCentavos, 6500000);

    const restaurar = await app.inject({
      method: 'POST',
      url: '/api/backup/restaurar',
      headers,
      payload,
    });
    assert.equal(restaurar.statusCode, 200, restaurar.body);

    const metaDepoisDaRestauracao = await app.inject({
      method: 'GET',
      url: '/api/dashboard/metas',
      headers,
    });
    assert.equal(metaDepoisDaRestauracao.statusCode, 200);
    assert.equal(metaDepoisDaRestauracao.json().metaMensal.valorMetaCentavos, 6500000);

    const usuarioRestaurado = await prisma.usuario.findUnique({ where: { id: admin.id } });
    assert.equal(usuarioRestaurado?.login, 'admin-b17');
    assert.equal(await prisma.refreshToken.count(), 0);
  } finally {
    await app.close();
  }
});
