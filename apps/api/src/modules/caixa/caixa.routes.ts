import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { abrirCaixaSchema, movimentacaoCaixaSchema, fecharCaixaSchema } from './caixa.schemas.js';

export const caixaRoutes: FastifyPluginAsync = async (app) => {
  // Status atual (se há caixa aberto para o usuário)
  app.get('/caixa/status', { preHandler: authenticate }, async (req, reply) => {
    const sessao = await prisma.caixaSessao.findFirst({
      where: { usuarioAberturaId: req.usuario!.id, status: 'ABERTO' },
      include: { movimentacoes: true },
    });
    if (!sessao) return reply.send({ aberto: false });
    const esperado = await prisma.movimentacaoCaixa.aggregate({
      where: { caixaId: sessao.id },
      _sum: { valorCentavos: true },
    });
    return reply.send({
      aberto: true,
      sessao,
      valorEsperadoCentavos: (esperado._sum.valorCentavos || 0) + sessao.valorAberturaCentavos,
    });
  });

  // Abrir caixa
  app.post('/caixa/abrir', { preHandler: authenticate }, async (req, reply) => {
    const parsed = abrirCaixaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });

    // Verifica se já existe caixa aberto
    const jaAberto = await prisma.caixaSessao.findFirst({
      where: { status: 'ABERTO' },
    });
    if (jaAberto) return reply.code(400).send({ erro: 'Ja existe um caixa aberto. Feche antes de abrir outro.' });

    const sessao = await prisma.caixaSessao.create({
      data: {
        usuarioAberturaId: req.usuario!.id,
        valorAberturaCentavos: parsed.data.valorAberturaCentavos,
        observacao: parsed.data.observacao,
      },
    });

    // Movimentacao de ABERTURA
    if (parsed.data.valorAberturaCentavos > 0) {
      await prisma.movimentacaoCaixa.create({
        data: {
          caixaId: sessao.id,
          tipo: 'ABERTURA',
          valorCentavos: parsed.data.valorAberturaCentavos,
          descricao: 'Abertura de caixa',
          usuarioId: req.usuario!.id,
        },
      });
    }

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CAIXA_ABERTO',
      entidade: 'CaixaSessao', entidadeId: sessao.id,
      dadosDepois: { valorAberturaCentavos: parsed.data.valorAberturaCentavos }, ip: req.ip,
    });

    return reply.code(201).send(sessao);
  });

  // Movimentacao (sangria/suprimento/despesa)
  app.post('/caixa/:id/movimentacao', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE', 'CAIXA')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = movimentacaoCaixaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });

    const sessao = await prisma.caixaSessao.findUnique({ where: { id } });
    if (!sessao || sessao.status !== 'ABERTO') return reply.code(400).send({ erro: 'Caixa fechado ou inexistente' });

    // Sangria/despesa sao negativas no saldo; suprimento positivo
    const valorComSinal = parsed.data.tipo === 'SUPRIMENTO' ? parsed.data.valorCentavos : -parsed.data.valorCentavos;

    await prisma.movimentacaoCaixa.create({
      data: {
        caixaId: id,
        tipo: parsed.data.tipo,
        valorCentavos: valorComSinal,
        descricao: parsed.data.descricao,
        usuarioId: req.usuario!.id,
      },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: `CAIXA_${parsed.data.tipo}`,
      entidade: 'MovimentacaoCaixa', dadosDepois: { caixaId: id, valorCentavos: valorComSinal, descricao: parsed.data.descricao }, ip: req.ip,
    });

    return reply.code(201).send({ ok: true });
  });

  // Fechar caixa
  app.post('/caixa/:id/fechar', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = fecharCaixaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });

    const sessao = await prisma.caixaSessao.findUnique({ where: { id } });
    if (!sessao || sessao.status !== 'ABERTO') return reply.code(400).send({ erro: 'Caixa fechado ou inexistente' });

    // Calcula esperado
    const soma = await prisma.movimentacaoCaixa.aggregate({
      where: { caixaId: id },
      _sum: { valorCentavos: true },
    });
    const esperado = (soma._sum.valorCentavos || 0) + sessao.valorAberturaCentavos;
    const diferenca = parsed.data.valorFechamentoInformadoCentavos - esperado;

    await prisma.caixaSessao.update({
      where: { id },
      data: {
        status: 'FECHADO',
        fechadoEm: new Date(),
        usuarioFechamentoId: req.usuario!.id,
        valorFechamentoInformadoCentavos: parsed.data.valorFechamentoInformadoCentavos,
        valorFechamentoEsperadoCentavos: esperado,
        diferencaCentavos: diferenca,
        observacao: parsed.data.observacao,
      },
    });

    // Movimentacao de FECHAMENTO
    await prisma.movimentacaoCaixa.create({
      data: {
        caixaId: id,
        tipo: 'FECHAMENTO',
        valorCentavos: -esperado,  // Zera o caixa
        descricao: `Fechamento. Diferenca: ${diferenca >= 0 ? '+' : ''}${diferenca} centavos`,
        usuarioId: req.usuario!.id,
      },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id, acao: 'CAIXA_FECHADO',
      entidade: 'CaixaSessao', entidadeId: id,
      dadosDepois: { esperado, informado: parsed.data.valorFechamentoInformadoCentavos, diferenca }, ip: req.ip,
    });

    return reply.send({ ok: true, esperado, informado: parsed.data.valorFechamentoInformadoCentavos, diferenca });
  });

  // Historico de sessoes
  app.get('/caixa/historico', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '20', 10)));
    const [total, sessoes] = await Promise.all([
      prisma.caixaSessao.count(),
      prisma.caixaSessao.findMany({
        orderBy: { abertoEm: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { _count: { select: { movimentacoes: true } } },
      }),
    ]);
    return reply.send({ data: sessoes, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  // Detalhe de sessao com movimentacoes
  app.get('/caixa/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sessao = await prisma.caixaSessao.findUnique({
      where: { id },
      include: { movimentacoes: { orderBy: { criadoEm: 'asc' } } },
    });
    if (!sessao) return reply.code(404).send({ erro: 'Sessao nao encontrada' });
    return reply.send(sessao);
  });
};
