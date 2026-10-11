import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';

export const relatoriosRoutes: FastifyPluginAsync = async (app) => {
  // Relatorio de vendas por periodo
  app.get('/relatorios/vendas', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { dataInicio?: string; dataFim?: string };
    const where: any = { status: 'FINALIZADA' };
    if (q.dataInicio || q.dataFim) {
      where.criadoEm = {};
      if (q.dataInicio) where.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.criadoEm.lte = new Date(q.dataFim);
    }
    const vendas = await prisma.venda.findMany({
      where,
      include: { cliente: true, itens: true, pagamentos: true },
      orderBy: { criadoEm: 'asc' },
    });

    const total = vendas.reduce((acc, v) => acc + v.totalCentavos, 0);
    const totalDescontos = vendas.reduce((acc, v) => acc + v.descontoCentavos, 0);
    const numVendas = vendas.length;
    const ticketMedio = numVendas > 0 ? Math.round(total / numVendas) : 0;

    return reply.send({
      periodo: { inicio: q.dataInicio, fim: q.dataFim },
      resumo: { total, totalDescontos, numVendas, ticketMedio },
      vendas: vendas.map(v => ({
        numero: v.numero, data: v.criadoEm, cliente: v.cliente?.nome || 'Anonima',
        subtotal: v.subtotalCentavos, desconto: v.descontoCentavos, total: v.totalCentavos,
      })),
    });
  });

  // Produtos mais vendidos
  app.get('/relatorios/produtos-mais-vendidos', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { dataInicio?: string; dataFim?: string; limite?: string };
    const limite = Math.min(100, Math.max(1, parseInt(q.limite || '20', 10)));
    const where: any = { venda: { status: 'FINALIZADA' } };
    if (q.dataInicio || q.dataFim) {
      where.venda.criadoEm = {};
      if (q.dataInicio) where.venda.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.venda.criadoEm.lte = new Date(q.dataFim);
    }
    const itens = await prisma.itemVenda.findMany({
      where,
      include: { produto: true },
    });
    // Agrupa por produto
    const mapa = new Map<string, { nome: string; codigo: string; qtd: number; valor: number }>();
    for (const it of itens) {
      const key = it.produtoId;
      if (!mapa.has(key)) mapa.set(key, { nome: it.nomeProdutoSnapshot, codigo: it.codigoSnapshot, qtd: 0, valor: 0 });
      const e = mapa.get(key)!;
      e.qtd += it.quantidade;
      e.valor += it.subtotalCentavos;
    }
    const ordenado = Array.from(mapa.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.qtd - a.qtd).slice(0, limite);
    return reply.send({ produtos: ordenado });
  });

  // Formas de pagamento
  app.get('/relatorios/formas-pagamento', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { dataInicio?: string; dataFim?: string };
    const where: any = { venda: { status: 'FINALIZADA' } };
    if (q.dataInicio || q.dataFim) {
      where.venda.criadoEm = {};
      if (q.dataInicio) where.venda.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.venda.criadoEm.lte = new Date(q.dataFim);
    }
    const pagamentos = await prisma.pagamentoVenda.findMany({ where });
    const porForma = new Map<string, { count: number; valor: number }>();
    for (const p of pagamentos) {
      if (!porForma.has(p.forma)) porForma.set(p.forma, { count: 0, valor: 0 });
      const e = porForma.get(p.forma)!;
      e.count++;
      e.valor += p.valorCentavos;
    }
    return reply.send({ formas: Array.from(porForma.entries()).map(([forma, v]) => ({ forma, ...v })) });
  });

  // Lucro (precisa de custo — vamos pegar do item_venda usando preco de custo na data da venda, aproximado pelo atual)
  app.get('/relatorios/lucro', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const q = req.query as { dataInicio?: string; dataFim?: string };
    const where: any = { status: 'FINALIZADA' };
    if (q.dataInicio || q.dataFim) {
      where.criadoEm = {};
      if (q.dataInicio) where.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.criadoEm.lte = new Date(q.dataFim);
    }
    const vendas = await prisma.venda.findMany({
      where,
      include: { itens: { include: { produto: { select: { precoCustoCentavos: true } } } } },
    });
    let receita = 0, custo = 0;
    for (const v of vendas) {
      receita += v.totalCentavos;
      for (const it of v.itens) {
        custo += it.produto.precoCustoCentavos * it.quantidade;
      }
    }
    const lucro = receita - custo;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;
    return reply.send({ receita, custo, lucro, margem: parseFloat(margem.toFixed(2)) });
  });

  // Estoque atual
  app.get('/relatorios/estoque', { preHandler: authenticate }, async (_req, reply) => {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      select: {
        id: true, codigoInterno: true, nome: true, unidade: true,
        estoqueAtual: true, estoqueMinimo: true, estoqueMaximo: true,
        precoCustoCentavos: true, precoVendaCentavos: true,
        marca: { select: { nome: true } },
      },
      orderBy: { nome: 'asc' },
    });
    const valorEstoqueCusto = produtos.reduce((acc, p) => acc + (p.precoCustoCentavos * p.estoqueAtual), 0);
    const valorEstoqueVenda = produtos.reduce((acc, p) => acc + (p.precoVendaCentavos * p.estoqueAtual), 0);
    return reply.send({ produtos, valorEstoqueCusto, valorEstoqueVenda });
  });
};
