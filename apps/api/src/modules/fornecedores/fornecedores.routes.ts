import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarFornecedorSchema, atualizarFornecedorSchema, fornecedorCsvRowSchema } from './fornecedores.schemas.js';

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { current.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        current.push(field); rows.push(current); current = []; field = '';
      } else field += c;
    }
  }
  if (field !== '' || current.length > 0) { current.push(field); rows.push(current); }
  const filtered = rows.filter(r => r.some(f => f.trim() !== ''));
  if (filtered.length === 0) return [];
  const headers = filtered[0].map(h => h.trim());
  return filtered.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] || ''; });
    return obj;
  });
}

export const fornecedoresRoutes: FastifyPluginAsync = async (app) => {
  app.get('/fornecedores', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { busca?: string; ativo?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));
    const where: any = {};
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    if (q.busca) {
      where.OR = [
        { razaoSocial: { contains: q.busca } },
        { nomeFantasia: { contains: q.busca } },
        { cnpj: { contains: q.busca } },
      ];
    }
    const [total, fornecedores] = await Promise.all([
      prisma.fornecedor.count({ where }),
      prisma.fornecedor.findMany({ where, orderBy: { razaoSocial: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return reply.send({ data: fornecedores, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.get('/fornecedores/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = await prisma.fornecedor.findUnique({ where: { id }, include: { compras: { orderBy: { criadoEm: 'desc' }, take: 10 } } });
    if (!f) return reply.code(404).send({ erro: 'Fornecedor nao encontrado' });
    return reply.send(f);
  });

  app.post('/fornecedores', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const parsed = criarFornecedorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const f = await prisma.fornecedor.create({ data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'FORNECEDOR_CRIADO',
        entidade: 'Fornecedor', entidadeId: f.id, dadosDepois: f, ip: req.ip,
      });
      return reply.code(201).send(f);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'CNPJ ja existe' });
      throw e;
    }
  });

  app.put('/fornecedores/:id', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarFornecedorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const antes = await prisma.fornecedor.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Fornecedor nao encontrado' });
    try {
      const atualizado = await prisma.fornecedor.update({ where: { id }, data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'FORNECEDOR_EDITADO',
        entidade: 'Fornecedor', entidadeId: id, dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
      });
      return reply.send(atualizado);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'CNPJ ja existe' });
      throw e;
    }
  });

  app.delete('/fornecedores/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = await prisma.fornecedor.findUnique({ where: { id } });
    if (!f) return reply.code(404).send({ erro: 'Fornecedor nao encontrado' });
    await prisma.fornecedor.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'FORNECEDOR_DESATIVADO',
      entidade: 'Fornecedor', entidadeId: id, ip: req.ip,
    });
    return reply.send({ ok: true });
  });

  app.post('/fornecedores/importar', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const body = req.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ erro: 'CSV vazio' });
    const objetos = parseCSV(body.csv);
    if (objetos.length === 0) return reply.code(400).send({ erro: 'CSV sem linhas validas' });

    const cnpjExistentes = new Set<string>();
    const cnpjNoBanco = await prisma.fornecedor.findMany({ where: { cnpj: { not: null } }, select: { cnpj: true } });
    cnpjNoBanco.forEach(f => f.cnpj && cnpjExistentes.add(f.cnpj));

    let criados = 0, atualizados = 0, erros = 0;
    const detalhesErros: Array<{ linha: number; erro: string }> = [];

    for (let i = 0; i < objetos.length; i++) {
      const parsed = fornecedorCsvRowSchema.safeParse(objetos[i]);
      if (!parsed.success) { erros++; detalhesErros.push({ linha: i + 2, erro: parsed.error.issues[0]?.message || 'invalido' }); continue; }
      const d = parsed.data;
      try {
        if (d.cnpj && cnpjExistentes.has(d.cnpj)) {
          await prisma.fornecedor.update({ where: { cnpj: d.cnpj }, data: d });
          atualizados++;
        } else {
          await prisma.fornecedor.create({ data: d as any });
          if (d.cnpj) cnpjExistentes.add(d.cnpj);
          criados++;
        }
      } catch (e: any) { erros++; detalhesErros.push({ linha: i + 2, erro: e.message }); }
    }
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'FORNECEDORES_IMPORTADOS',
      entidade: 'Fornecedor', dadosDepois: { criados, atualizados, erros, totalLinhas: objetos.length }, ip: req.ip,
    });
    return reply.send({ criados, atualizados, erros, totalLinhas: objetos.length, detalhesErros: detalhesErros.slice(0, 50) });
  });

  app.get('/fornecedores/template-csv', { preHandler: authenticate }, async (_req, reply) => {
    const cab = 'razaoSocial,nomeFantasia,cnpj,telefone,email,cidade,uf,contato';
    const ex = 'Oficina das Tintas LTDA,Oficina das Tintas,12345678000199,1140028922,contato@oficinadas tintas.com.br,Sao Paulo,SP,Joao';
    return reply.type('text/csv').send(`${cab}\n${ex}\n`);
  });
};
