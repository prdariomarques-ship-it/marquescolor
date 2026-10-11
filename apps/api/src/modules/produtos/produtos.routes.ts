import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import {
  criarProdutoSchema,
  atualizarProdutoSchema,
  produtoCsvRowSchema,
} from './produtos.schemas.js';
import { realParaCentavos } from '../../lib/money.js';

function parseCSV(text: string): string[][] {
  // Parser CSV simples — sem dependências externas
  // Suporta aspas duplas para escapar virgulas e quebras de linha
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        current.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  // Remove linhas totalmente vazias
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

function csvParaObjetos(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const objetos: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j] || '';
    }
    objetos.push(obj);
  }
  return objetos;
}

export const produtosRoutes: FastifyPluginAsync = async (app) => {
  // Listar com filtros e paginacao
  app.get('/produtos', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as {
      busca?: string;
      ativo?: string;
      categoriaId?: string;
      marcaId?: string;
      estoqueBaixo?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));

    const where: any = {};
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    if (q.categoriaId) where.categoriaId = q.categoriaId;
    if (q.marcaId) where.marcaId = q.marcaId;
    if (q.busca) {
      where.OR = [
        { nome: { contains: q.busca } },
        { codigoInterno: { contains: q.busca } },
        { codigoBarras: { contains: q.busca } },
      ];
    }
    if (q.estoqueBaixo === 'true') {
      where.estoqueAtual = { lte: 0 };
      where.estoqueMinimo = { gt: 0 };
    }

    const [total, produtos] = await Promise.all([
      prisma.produto.count({ where }),
      prisma.produto.findMany({
        where,
        include: { marca: true, categoria: true },
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return reply.send({
      data: produtos,
      page, pageSize, total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Buscar por id
  app.get('/produtos/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const produto = await prisma.produto.findUnique({
      where: { id },
      include: { marca: true, categoria: true },
    });
    if (!produto) return reply.code(404).send({ erro: 'Produto nao encontrado' });
    return reply.send(produto);
  });

  // Criar — ADMIN ou GERENTE
  app.post('/produtos', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const parsed = criarProdutoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    try {
      const produto = await prisma.produto.create({
        data: {
          ...parsed.data,
          // Define margem automatica se nao passada
          margemPercentual: parsed.data.precoCustoCentavos > 0
            ? ((parsed.data.precoVendaCentavos - parsed.data.precoCustoCentavos) / parsed.data.precoCustoCentavos) * 100
            : 0,
        },
        include: { marca: true, categoria: true },
      });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'PRODUTO_CRIADO',
        entidade: 'Produto', entidadeId: produto.id, dadosDepois: produto, ip: req.ip,
      });
      return reply.code(201).send(produto);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Codigo interno ou codigo de barras ja existe' });
      throw e;
    }
  });

  // Editar — ADMIN ou GERENTE
  app.put('/produtos/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarProdutoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const antes = await prisma.produto.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Produto nao encontrado' });

    const data = { ...parsed.data } as any;
    // Recalcula margem se custos mudaram
    if (data.precoCustoCentavos !== undefined || data.precoVendaCentavos !== undefined) {
      const custo = data.precoCustoCentavos ?? antes.precoCustoCentavos;
      const venda = data.precoVendaCentavos ?? antes.precoVendaCentavos;
      data.margemPercentual = custo > 0 ? ((venda - custo) / custo) * 100 : 0;
    }

    try {
      const atualizado = await prisma.produto.update({
        where: { id }, data,
        include: { marca: true, categoria: true },
      });
      await registrarAuditoria(prisma, {
        usuarioId: req.usuario!.id, acao: 'PRODUTO_EDITADO',
        entidade: 'Produto', entidadeId: id,
        dadosAntes: antes, dadosDepois: atualizado, ip: req.ip,
      });
      return reply.send(atualizado);
    } catch (e: any) {
      if (e.code === 'P2002') return reply.code(409).send({ erro: 'Codigo interno ou codigo de barras ja existe' });
      throw e;
    }
  });

  // Soft delete (desativar)
  app.delete('/produtos/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const produto = await prisma.produto.findUnique({ where: { id } });
    if (!produto) return reply.code(404).send({ erro: 'Produto nao encontrado' });
    await prisma.produto.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'PRODUTO_DESATIVADO',
      entidade: 'Produto', entidadeId: id, ip: req.ip,
    });
    return reply.send({ ok: true });
  });

  // Importar CSV
  app.post('/produtos/importar', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const body = req.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ erro: 'CSV vazio' });

    const objetos = csvParaObjetos(body.csv);
    if (objetos.length === 0) return reply.code(400).send({ erro: 'CSV sem linhas validas' });

    // Cache de marcas e categorias por nome (cria se nao existe)
    const marcasCache = new Map<string, string>();
    const categoriasCache = new Map<string, string>();
    const codigosJaNoBanco = new Set<string>();

    // Pré-carrega todas as marcas e categorias ativas
    const [marcas, categorias, codigos] = await Promise.all([
      prisma.marca.findMany({ where: { ativo: true } }),
      prisma.categoria.findMany({ where: { ativo: true } }),
      prisma.produto.findMany({ select: { codigoInterno: true } }),
    ]);
    marcas.forEach(m => marcasCache.set(m.nome.toLowerCase(), m.id));
    categorias.forEach(c => categoriasCache.set(c.nome.toLowerCase(), c.id));
    codigos.forEach(c => codigosJaNoBanco.add(c.codigoInterno));

    let criados = 0;
    let atualizados = 0;
    let erros = 0;
    const detalhesErros: Array<{ linha: number; erro: string }> = [];

    for (let i = 0; i < objetos.length; i++) {
      const row = objetos[i];
      const parsed = produtoCsvRowSchema.safeParse(row);
      if (!parsed.success) {
        erros++;
        detalhesErros.push({ linha: i + 2, erro: parsed.error.issues[0]?.message || 'invalido' });
        continue;
      }
      const d = parsed.data;

      // Resolve marca por nome (cria se nao existe)
      let marcaId: string | null = null;
      if (d.marcaNome) {
        const key = d.marcaNome.toLowerCase();
        if (marcasCache.has(key)) {
          marcaId = marcasCache.get(key)!;
        } else {
          const nova = await prisma.marca.create({ data: { nome: d.marcaNome } });
          marcasCache.set(key, nova.id);
          marcaId = nova.id;
        }
      }

      // Resolve categoria por nome (cria se nao existe)
      let categoriaId: string | null = null;
      if (d.categoriaNome) {
        const key = d.categoriaNome.toLowerCase();
        if (categoriasCache.has(key)) {
          categoriaId = categoriasCache.get(key)!;
        } else {
          const nova = await prisma.categoria.create({ data: { nome: d.categoriaNome } });
          categoriasCache.set(key, nova.id);
          categoriaId = nova.id;
        }
      }

      const precoCusto = d.precoCustoCentavos || 0;
      const precoVenda = d.precoVendaCentavos || 0;
      const margem = precoCusto > 0 ? ((precoVenda - precoCusto) / precoCusto) * 100 : 0;

      const dadosProduto = {
        codigoInterno: d.codigoInterno,
        codigoBarras: d.codigoBarras || null,
        nome: d.nome,
        descricao: d.descricao || null,
        marcaId, categoriaId,
        unidade: (d.unidade as any) || 'UN',
        cor: d.cor || null,
        acabamento: d.acabamento || null,
        volume: d.volume || null,
        precoCustoCentavos: precoCusto,
        precoVendaCentavos: precoVenda,
        margemPercentual: margem,
        estoqueAtual: d.estoqueAtual || 0,
        estoqueMinimo: d.estoqueMinimo || 0,
        estoqueMaximo: d.estoqueMaximo || 0,
        localizacao: d.localizacao || null,
        ativo: true,
      };

      if (codigosJaNoBanco.has(d.codigoInterno)) {
        // Atualiza produto existente
        try {
          await prisma.produto.update({
            where: { codigoInterno: d.codigoInterno },
            data: dadosProduto,
          });
          atualizados++;
        } catch (e: any) {
          erros++;
          detalhesErros.push({ linha: i + 2, erro: e.message || 'erro ao atualizar' });
        }
      } else {
        try {
          await prisma.produto.create({ data: dadosProduto });
          codigosJaNoBanco.add(d.codigoInterno);
          criados++;
        } catch (e: any) {
          erros++;
          detalhesErros.push({ linha: i + 2, erro: e.message || 'erro ao criar' });
        }
      }
    }

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'PRODUTOS_IMPORTADOS',
      entidade: 'Produto', entidadeId: null,
      dadosDepois: { criados, atualizados, erros, totalLinhas: objetos.length },
      ip: req.ip,
    });

    return reply.send({
      criados, atualizados, erros,
      totalLinhas: objetos.length,
      detalhesErros: detalhesErros.slice(0, 50), // limita a 50 erros
    });
  });

  // Template CSV para download
  app.get('/produtos/template-csv', { preHandler: authenticate }, async (_req, reply) => {
    const cabecalho = 'codigoInterno,codigoBarras,nome,descricao,marcaNome,categoriaNome,unidade,cor,acabamento,volume,precoCustoCentavos,precoVendaCentavos,estoqueAtual,estoqueMinimo,estoqueMaximo,localizacao';
    const exemplo = '001,7891234567890,Tinta Acrilica Branca 18L,,Suvinil,Tinta Acrilica,LATAS,Branco,Fosco,18L,28500,39900,10,5,50,Prateleira A1';
    return reply.type('text/csv').send(`${cabecalho}\n${exemplo}\n`);
  });
};
