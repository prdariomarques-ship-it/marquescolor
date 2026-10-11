import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { criarCompraSchema } from './compras.schemas.js';

export const comprasRoutes: FastifyPluginAsync = async (app) => {
  app.get('/compras', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '50', 10)));
    const where: any = {};
    if (q.status) where.status = q.status;
    const [total, compras] = await Promise.all([
      prisma.compra.count({ where }),
      prisma.compra.findMany({
        where,
        include: { fornecedor: true, itens: { include: { produto: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return reply.send({ data: compras, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  app.get('/compras/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const compra = await prisma.compra.findUnique({
      where: { id },
      include: { fornecedor: true, itens: { include: { produto: true } } },
    });
    if (!compra) return reply.code(404).send({ erro: 'Compra nao encontrada' });
    return reply.send(compra);
  });

  app.post('/compras', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const parsed = criarCompraSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });
    const d = parsed.data;
    try {
      const compra = await prisma.$transaction(async (tx) => {
        const subtotal = d.itens.reduce((acc, it) => acc + (it.precoCustoCentavos * it.quantidade), 0);
        const total = Math.max(0, subtotal - d.descontoCentavos + d.freteCentavos);

        const nova = await tx.compra.create({
          data: {
            fornecedorId: d.fornecedorId,
            numeroPedido: d.numeroPedido,
            dataCompra: d.dataCompra ? new Date(d.dataCompra) : new Date(),
            subtotalCentavos: subtotal,
            descontoCentavos: d.descontoCentavos,
            freteCentavos: d.freteCentavos,
            totalCentavos: total,
            formaPagamento: d.formaPagamento,
            observacoes: d.observacoes,
            usuarioId: req.usuario!.id,
            status: d.status,
          },
        });

        for (const it of d.itens) {
          await tx.itemCompra.create({
            data: {
              compraId: nova.id,
              produtoId: it.produtoId,
              quantidade: it.quantidade,
              precoCustoCentavos: it.precoCustoCentavos,
              subtotalCentavos: it.precoCustoCentavos * it.quantidade,
            },
          });
        }

        // Se confirmada, da entrada em estoque
        if (d.status === 'CONFIRMADA') {
          for (const it of d.itens) {
            const produto = await tx.produto.findUnique({ where: { id: it.produtoId } });
            if (!produto) continue;
            const saldoAnterior = produto.estoqueAtual;
            const novoSaldo = saldoAnterior + it.quantidade;
            await tx.produto.update({
              where: { id: it.produtoId },
              data: {
                estoqueAtual: novoSaldo,
                precoCustoCentavos: it.precoCustoCentavos,  // atualiza custo
              },
            });
            await tx.movimentacaoEstoque.create({
              data: {
                produtoId: it.produtoId,
                tipo: 'ENTRADA_COMPRA',
                quantidade: it.quantidade,
                saldoAnterior,
                saldoPosterior: novoSaldo,
                documentoRef: `Compra #${nova.id.substring(0, 8)}`,
                usuarioId: req.usuario!.id,
              },
            });
          }
        }

        await registrarAuditoria(tx, {
          usuarioId: req.usuario!.id, acao: 'COMPRA_CRIADA',
          entidade: 'Compra', entidadeId: nova.id,
          dadosDepois: { status: d.status, total }, ip: req.ip,
        });

        return nova;
      });

      const completa = await prisma.compra.findUnique({
        where: { id: compra.id },
        include: { fornecedor: true, itens: { include: { produto: true } } },
      });
      return reply.code(201).send(completa);
    } catch (e: any) { return reply.code(400).send({ erro: e.message }); }
  });

  // Confirmar compra (da entrada em estoque)
  app.post('/compras/:id/confirmar', { preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const compra = await prisma.compra.findUnique({ where: { id }, include: { itens: true } });
    if (!compra) return reply.code(404).send({ erro: 'Compra nao encontrada' });
    if (compra.status === 'CONFIRMADA') return reply.code(400).send({ erro: 'Compra ja confirmada' });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.compra.update({ where: { id }, data: { status: 'CONFIRMADA' } });
        for (const it of compra.itens) {
          const p = await tx.produto.findUnique({ where: { id: it.produtoId } });
          if (!p) continue;
          const saldoAnterior = p.estoqueAtual;
          const novoSaldo = saldoAnterior + it.quantidade;
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoqueAtual: novoSaldo, precoCustoCentavos: it.precoCustoCentavos },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: it.produtoId,
              tipo: 'ENTRADA_COMPRA',
              quantidade: it.quantidade,
              saldoAnterior,
              saldoPosterior: novoSaldo,
              documentoRef: `Compra #${id.substring(0, 8)}`,
              usuarioId: req.usuario!.id,
            },
          });
        }
        await registrarAuditoria(tx, {
          usuarioId: req.usuario!.id, acao: 'COMPRA_CONFIRMADA',
          entidade: 'Compra', entidadeId: id, ip: req.ip,
        });
      });
      return reply.send({ ok: true });
    } catch (e: any) { return reply.code(500).send({ erro: e.message }); }
  });
};
