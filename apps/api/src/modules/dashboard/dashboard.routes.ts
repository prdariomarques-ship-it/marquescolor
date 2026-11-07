import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { z } from 'zod';

const salvarMetaSchema = z.object({
  valorMetaCentavos: z.number().int().positive().max(2_000_000_000),
  cenario: z.enum(['conservador', 'moderado', 'arrojado', 'manual']).default('manual'),
});

function competenciaUTC(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inicioMesUTC(ano: number, mesZeroBased: number): Date {
  return new Date(Date.UTC(ano, mesZeroBased, 1, 0, 0, 0, 0));
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/metricas', { preHandler: authenticate }, async (_req, reply) => {
    const hoje = new Date();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);

    const vendasHoje = await prisma.venda.findMany({
      where: { criadoEm: { gte: inicioHoje, lt: fimHoje }, status: 'FINALIZADA' },
      select: { totalCentavos: true },
    });
    const totalVendidoHoje = vendasHoje.reduce((acc, venda) => acc + venda.totalCentavos, 0);

    const produtos = await prisma.produto.findMany({
      where: { ativo: true, estoqueMinimo: { gt: 0 } },
      select: { estoqueAtual: true, estoqueMinimo: true },
    });
    const estoqueBaixo = produtos.filter(p => p.estoqueAtual <= p.estoqueMinimo).length;

    let valorEmCaixa = 0;
    const caixaAberto = await prisma.caixaSessao.findFirst({
      where: { status: 'ABERTO' },
      include: { movimentacoes: true },
    });
    if (caixaAberto) {
      valorEmCaixa = caixaAberto.valorAberturaCentavos
        + caixaAberto.movimentacoes.reduce((acc, m) => acc + m.valorCentavos, 0);
    }

    const [numVendasHoje, vendasPendentes, ultimasVendas] = await Promise.all([
      prisma.venda.count({ where: { criadoEm: { gte: inicioHoje, lt: fimHoje }, status: 'FINALIZADA' } }),
      prisma.venda.count({ where: { status: 'RASCUNHO' } }),
      prisma.venda.findMany({
        orderBy: { criadoEm: 'desc' },
        take: 5,
        include: { cliente: { select: { nome: true } } },
      }),
    ]);

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

  // Metas e projeções usam exclusivamente vendas FINALIZADAS e meses fechados.
  app.get('/dashboard/metas', { preHandler: authenticate }, async (_req, reply) => {
    const agora = new Date();
    const anoAtual = agora.getUTCFullYear();
    const mesAtual = agora.getUTCMonth();
    const competencia = competenciaUTC(agora);
    const inicioAtual = inicioMesUTC(anoAtual, mesAtual);
    const inicioProximo = inicioMesUTC(anoAtual, mesAtual + 1);
    const diasNoMes = Math.round((inicioProximo.getTime() - inicioAtual.getTime()) / 86400000);
    const diasRestantes = Math.max(1, diasNoMes - agora.getUTCDate() + 1);

    const historico = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const inicio = inicioMesUTC(anoAtual, mesAtual - 6 + index);
      const fim = inicioMesUTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1);
      const vendas = await prisma.venda.findMany({
        where: { status: 'FINALIZADA', criadoEm: { gte: inicio, lt: fim } },
        select: { totalCentavos: true },
      });
      return {
        competencia: competenciaUTC(inicio),
        mes: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(inicio).replace('.', ''),
        faturamentoCentavos: vendas.reduce((total, venda) => total + venda.totalCentavos, 0),
      };
    }));

    const pesos = [1, 2, 3, 4, 5, 6];
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    const mediaPonderada = historico.length
      ? Math.round(historico.reduce((total, item, index) => total + item.faturamentoCentavos * pesos[index], 0) / somaPesos)
      : 0;

    const mediaAnterior = historico.slice(0, 3).reduce((t, item) => t + item.faturamentoCentavos, 0) / 3;
    const mediaRecente = historico.slice(3).reduce((t, item) => t + item.faturamentoCentavos, 0) / 3;
    const crescimentoTendencia = mediaAnterior > 0
      ? Math.max(-0.15, Math.min(0.30, mediaRecente / mediaAnterior - 1))
      : 0;

    const sugestoes = {
      conservador: Math.round(mediaPonderada * 1.05),
      moderado: Math.round(mediaPonderada * (1 + crescimentoTendencia)),
      arrojado: Math.round(mediaPonderada * 1.18),
    };

    const [meta, vendasMes] = await Promise.all([
      prisma.metaMensal.findUnique({ where: { competencia } }),
      prisma.venda.findMany({
        where: { status: 'FINALIZADA', criadoEm: { gte: inicioAtual, lt: inicioProximo } },
        select: { totalCentavos: true },
      }),
    ]);

    const faturamentoMes = vendasMes.reduce((total, venda) => total + venda.totalCentavos, 0);
    const metaCentavos = meta?.valorMetaCentavos ?? 0;
    const restanteCentavos = Math.max(0, metaCentavos - faturamentoMes);

    return reply.send({
      competencia,
      faturamentoMesCentavos: faturamentoMes,
      metaMensal: meta ? {
        valorMetaCentavos: meta.valorMetaCentavos,
        cenario: meta.cenario,
        origem: meta.origem,
        atualizadoEm: meta.atualizadoEm,
      } : null,
      percentualAtingido: metaCentavos > 0 ? Number((faturamentoMes / metaCentavos * 100).toFixed(1)) : 0,
      restanteCentavos,
      ritmoDiarioCentavos: Math.ceil(restanteCentavos / diasRestantes),
      diasRestantes,
      historico,
      mediaPonderadaCentavos: mediaPonderada,
      crescimentoTendenciaPct: Number((crescimentoTendencia * 100).toFixed(1)),
      sugestoesCentavos: sugestoes,
    });
  });

  app.put('/dashboard/metas', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const parsed = salvarMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Meta invalida' });
    }
    const competencia = competenciaUTC(new Date());
    const meta = await prisma.metaMensal.upsert({
      where: { competencia },
      create: {
        competencia,
        valorMetaCentavos: parsed.data.valorMetaCentavos,
        cenario: parsed.data.cenario,
        origem: parsed.data.cenario === 'manual' ? 'MANUAL' : 'SUGESTAO_HISTORICA',
        atualizadoPorId: req.usuario!.id,
      },
      update: {
        valorMetaCentavos: parsed.data.valorMetaCentavos,
        cenario: parsed.data.cenario,
        origem: parsed.data.cenario === 'manual' ? 'MANUAL' : 'SUGESTAO_HISTORICA',
        atualizadoPorId: req.usuario!.id,
      },
    });
    return reply.send(meta);
  });
};
