import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarClienteSchema, atualizarClienteSchema, clienteCsvRowSchema } from './clientes.schemas.js';

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

export const clientesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/clientes', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { busca?: string; ativo?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));
    const where: any = {};
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    if (q.busca) {
      where.OR = [
        { nome: { contains: q.busca } },
        { cpfCnpj: { contains: q.busca } },
        { telefone: { contains: q.busca } },
      ];
    }
    const [total, clientes] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({ where, orderBy: { nome: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return reply.send({ data: clientes, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.get('/clientes/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: { vendas: { orderBy: { criadoEm: 'desc' }, take: 10 } },
    });
    if (!cliente) return reply.code(404).send({ erro: 'Cliente nao encontrado' });
    return reply.send(cliente);
  });

  app.post('/clientes', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA')] }, async (req, reply) => {
    const parsed = criarClienteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const c = await prisma.cliente.create({ data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'CLIENTE_CRIADO',
        entidade: 'Cliente', entidadeId: c.id, dadosDepois: c, ip: req.ip,
      });
      return reply.code(201).send(c);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'CPF/CNPJ ja existe' });
      throw e;
    }
  });

  app.put('/clientes/:id', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarClienteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const antes = await prisma.cliente.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Cliente nao encontrado' });
    try {
      const atualizado = await prisma.cliente.update({ where: { id }, data: parsed.data });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'CLIENTE_EDITADO',
        entidade: 'Cliente', entidadeId: id,
        dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
      });
      return reply.send(atualizado);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'CPF/CNPJ ja existe' });
      throw e;
    }
  });

  app.delete('/clientes/:id', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.cliente.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ erro: 'Cliente nao encontrado' });
    await prisma.cliente.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CLIENTE_DESATIVADO',
      entidade: 'Cliente', entidadeId: id, ip: req.ip,
    });
    return reply.send({ ok: true });
  });

  app.post('/clientes/importar', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const body = req.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ erro: 'CSV vazio' });
    const objetos = parseCSV(body.csv);
    if (objetos.length === 0) return reply.code(400).send({ erro: 'CSV sem linhas validas' });

    const cpfExistentes = new Set<string>();
    const cpfNoBanco = await prisma.cliente.findMany({ where: { cpfCnpj: { not: null } }, select: { cpfCnpj: true } });
    cpfNoBanco.forEach(c => c.cpfCnpj && cpfExistentes.add(c.cpfCnpj));

    let criados = 0, atualizados = 0, erros = 0;
    const detalhesErros: Array<{ linha: number; erro: string }> = [];

    for (let i = 0; i < objetos.length; i++) {
      const parsed = clienteCsvRowSchema.safeParse(objetos[i]);
      if (!parsed.success) { erros++; detalhesErros.push({ linha: i + 2, erro: parsed.error.issues[0]?.message || 'invalido' }); continue; }
      const d = parsed.data;
      try {
        if (d.cpfCnpj && cpfExistentes.has(d.cpfCnpj)) {
          await prisma.cliente.update({ where: { cpfCnpj: d.cpfCnpj }, data: d });
          atualizados++;
        } else {
          await prisma.cliente.create({ data: d as any });
          if (d.cpfCnpj) cpfExistentes.add(d.cpfCnpj);
          criados++;
        }
      } catch (e: any) { erros++; detalhesErros.push({ linha: i + 2, erro: e.message }); }
    }
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CLIENTES_IMPORTADOS',
      entidade: 'Cliente', dadosDepois: { criados, atualizados, erros, totalLinhas: objetos.length }, ip: req.ip,
    });
    return reply.send({ criados, atualizados, erros, totalLinhas: objetos.length, detalhesErros: detalhesErros.slice(0, 50) });
  });

  app.get('/clientes/template-csv', { preHandler: authenticate }, async (_req, reply) => {
    const cab = 'nome,cpfCnpj,telefone,whatsapp,email,cep,endereco,numero,complemento,bairro,cidade,uf,limiteCreditoCentavos';
    const ex = 'Joao da Silva,12345678901,11987654321,11987654321,joao@email.com,09442-000,Rua das Flores,100,Apto 2, Centro,Ribeirao Pires,SP,100000';
    return reply.type('text/csv').send(`${cab}\n${ex}\n`);
  });
};
