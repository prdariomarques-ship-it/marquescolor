import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/metricas', { preHandler: authenticate }, async (_req, reply) => {
    // Data de hoje
    const hoje = new Date();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    // Total vendido hoje (apenas FINALIZADAS)
    const vendasHoje = await prisma.venda.findMany({
      where: { criadoEm: { gte: inicioHoje, lte: fimHoje }, status: 'FINALIZADA' },
      select: { totalCentavos: true, id: true },
    });
    const totalVendidoHoje = vendasHoje.reduce((acc, v) => acc + v.totalCentavos, 0);
    const numVendasHoje = vendasHoje.length;

    // Estoque baixo (estoqueAtual <= estoqueMinimo && estoqueMinimo > 0)
    const estoqueBaixo = await prisma.produto.count({
      where: { estoqueMinimo: { gt: 0 }, estoqueAtual: { lte: prisma.produto.fields.estoqueMinimo } },
    });

    // Caixa aberto (saldo)
    let valorEmCaixa = 0;
    const caixaAberto = await prisma.caixaSessao.findFirst({ where: { status: 'ABERTO' }, include: { movimentacoes: true } });
    if (caixaAberto) {
      const somaMov = caixaAberto.movimentacoes.reduce((acc, m) => acc + m.valorCentavos, 0);
      valorEmCaixa = somaMov + caixaAberto.valorAberturaCentavos;
    }

    // Vendas pendentes (RASCUNHO)
    const vendasPendentes = await prisma.venda.count({ where: { status: 'RASCUNHO' } });

    // Ultimas 5 vendas
    const ultimasVendas = await prisma.venda.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 5,
      include: { cliente: { select: { nome: true } } },
    });

    return reply.send({
      totalVendidoHoje,
      numVendasHoje,
      estoqueBaixo,
      valorEmCaixa,
      vendasPendentes,
      caixaAberto: !!caixaAberto,
      ultimasVendas: ultimasVendas.map(v => ({
        id: v.id,
        numero: v.numero,
        totalCentavos: v.totalCentavos,
        status: v.status,
        clienteNome: v.cliente?.nome || 'Anonima',
        criadoEm: v.criadoEm,
      })),
    });
  });
};
