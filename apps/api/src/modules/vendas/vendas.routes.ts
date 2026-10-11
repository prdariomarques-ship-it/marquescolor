import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { finalizarVendaSchema, cancelarVendaSchema } from './vendas.schemas.js';

export const vendasRoutes: FastifyPluginAsync = async (app) => {
  // Listar vendas
  app.get('/vendas', { preHandler: authenticate }, async (req, reply) => {
    const q = req.query as { busca?: string; status?: string; dataInicio?: string; dataFim?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.dataInicio || q.dataFim) {
      where.criadoEm = {};
      if (q.dataInicio) where.criadoEm.gte = new Date(q.dataInicio);
      if (q.dataFim) where.criadoEm.lte = new Date(q.dataFim);
    }
    const [total, vendas] = await Promise.all([
      prisma.venda.count({ where }),
      prisma.venda.findMany({
        where,
        include: {
          cliente: { select: { id: true, nome: true } },
          itens: { include: { produto: { select: { id: true, codigoInterno: true, nome: true } } } },
          pagamentos: true,
        },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return reply.send({ data: vendas, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  // Buscar por id
  app.get('/vendas/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const venda = await prisma.venda.findUnique({
      where: { id },
      include: {
        cliente: true,
        itens: { include: { produto: true } },
        pagamentos: true,
      },
    });
    if (!venda) return reply.code(404).send({ erro: 'Venda nao encontrada' });
    return reply.send(venda);
  });

  // Finalizar venda — transacao
  app.post('/vendas', { preHandler: authenticate }, async (req, reply) => {
    const parsed = finalizarVendaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });

    const d = parsed.data;
    const usuarioId = req.usuario!.id;

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        // 1. Valida produtos e calcula subtotal
        let subtotal = 0;
        const itensParaCriar: Array<{
          produtoId: string;
          quantidade: number;
          precoUnitarioCentavos: number;
          descontoItemCentavos: number;
          subtotalCentavos: number;
          nomeProdutoSnapshot: string;
          codigoSnapshot: string;
        }> = [];
        const produtosParaAtualizar: Array<{ id: string; novoEstoque: number; saldoAnterior: number }> = [];
        const movimentacoesParaCriar: Array<any> = [];

        for (const item of d.itens) {
          const produto = await tx.produto.findUnique({ where: { id: item.produtoId } });
          if (!produto) throw new Error(`Produto ${item.produtoId} nao encontrado`);
          if (!produto.ativo) throw new Error(`Produto ${produto.nome} esta inativo`);
          if (item.quantidade <= 0) throw new Error(`Quantidade invalida para ${produto.nome}`);
          if (item.precoUnitarioCentavos < 0) throw new Error(`Preco negativo para ${produto.nome}`);

          // Verifica estoque
          const config = await tx.configuracao.findUnique({ where: { id: 'unica' } });
          const permiteSemEstoque = config?.permitirVendaSemEstoque ?? true;
          if (!permiteSemEstoque && produto.estoqueAtual < item.quantidade) {
            throw new Error(`Estoque insuficiente para ${produto.nome} (atual: ${produto.estoqueAtual})`);
          }

          const subtotalItem = Math.round(item.precoUnitarioCentavos * item.quantidade - item.descontoItemCentavos);
          if (subtotalItem < 0) throw new Error(`Subtotal negativo para ${produto.nome}`);

          subtotal += subtotalItem;
          const saldoAnterior = produto.estoqueAtual;
          const novoEstoque = saldoAnterior - item.quantidade;

          itensParaCriar.push({
            produtoId: produto.id,
            quantidade: item.quantidade,
            precoUnitarioCentavos: item.precoUnitarioCentavos,
            descontoItemCentavos: item.descontoItemCentavos,
            subtotalCentavos: subtotalItem,
            nomeProdutoSnapshot: produto.nome,
            codigoSnapshot: produto.codigoInterno,
          });
          produtosParaAtualizar.push({ id: produto.id, novoEstoque, saldoAnterior });
          movimentacoesParaCriar.push({
            produtoId: produto.id,
            tipo: 'SAIDA_VENDA',
            quantidade: -item.quantidade,
            saldoAnterior,
            saldoPosterior: novoEstoque,
            usuarioId,
          });
        }

        // 2. Calcula total
        const descontoGeral = d.descontoGeralCentavos || 0;
        const acrescimo = d.acrescimoCentavos || 0;
        const total = Math.max(0, subtotal - descontoGeral + acrescimo);

        if (descontoGeral > subtotal) {
          throw new Error('Desconto geral maior que subtotal');
        }

        // 3. Pega proximo numero da venda
        const configAtual = await tx.configuracao.findUnique({ where: { id: 'unica' } });
        const numeroVenda = configAtual?.proximoNumeroVenda ?? 1;
        await tx.configuracao.update({
          where: { id: 'unica' },
          data: { proximoNumeroVenda: numeroVenda + 1 },
        });

        // 4. Cria a venda
        const venda = await tx.venda.create({
          data: {
            numero: numeroVenda,
            status: 'FINALIZADA',
            clienteId: d.clienteId || null,
            usuarioId,
            caixaId: d.caixaId || null,
            subtotalCentavos: subtotal,
            descontoCentavos: descontoGeral,
            acrescimoCentavos: acrescimo,
            totalCentavos: total,
          },
        });

        // 5. Cria itens
        for (const it of itensParaCriar) {
          await tx.itemVenda.create({
            data: { vendaId: venda.id, ...it },
          });
        }

        // 6. Cria pagamentos
        for (const p of d.pagamentos) {
          await tx.pagamentoVenda.create({
            data: {
              vendaId: venda.id,
              forma: p.forma,
              valorCentavos: p.valorCentavos,
              parcelas: p.parcelas,
              bandeira: p.bandeira || null,
              observacao: p.observacao || null,
            },
          });

          // Se FIADO, gera ContaReceber
          if (p.forma === 'FIADO') {
            await tx.contaReceber.create({
              data: {
                clienteId: d.clienteId || null,
                vendaId: venda.id,
                descricao: `Venda #${numeroVenda} (Fiado)`,
                valorCentavos: p.valorCentavos,
                vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                status: 'PENDENTE',
                formaPagamento: 'FIADO',
              },
            });
          }
        }

        // 7. Atualiza estoque e cria movimentacoes
        for (let i = 0; i < produtosParaAtualizar.length; i++) {
          const p = produtosParaAtualizar[i];
          await tx.produto.update({
            where: { id: p.id },
            data: { estoqueAtual: p.novoEstoque },
          });
          await tx.movimentacaoEstoque.create({
            data: { ...movimentacoesParaCriar[i] },
          });
        }

        // 8. Movimentacao de caixa (se houver caixaId)
        if (d.caixaId) {
          for (const p of d.pagamentos) {
            if (p.forma !== 'FIADO') {
              await tx.movimentacaoCaixa.create({
                data: {
                  caixaId: d.caixaId,
                  tipo: 'VENDA',
                  valorCentavos: p.valorCentavos,
                  descricao: `Venda #${numeroVenda} - ${p.forma}`,
                  usuarioId,
                },
              });
            }
          }
        }

        // 9. Auditoria
        await registrarAuditoria(tx, {
          usuarioId, acao: 'VENDA_FINALIZADA',
          entidade: 'Venda', entidadeId: venda.id,
          dadosDepois: { numero: numeroVenda, total, itens: itensParaCriar.length },
          ip: req.ip,
        });

        return { vendaId: venda.id, numero: numeroVenda, total };
      });

      // Carrega venda completa para retorno
      const vendaCompleta = await prisma.venda.findUnique({
        where: { id: resultado.vendaId },
        include: { cliente: true, itens: { include: { produto: true } }, pagamentos: true },
      });

      return reply.code(201).send(vendaCompleta);
    } catch (e: any) {
      return reply.code(400).send({ erro: e.message });
    }
  });

  // Cancelar venda
  app.post('/vendas/:id/cancelar', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = cancelarVendaSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ erro: parsed.error.issues[0]?.message });

    const venda = await prisma.venda.findUnique({
      where: { id },
      include: { itens: true, pagamentos: true },
    });
    if (!venda) return reply.code(404).send({ erro: 'Venda nao encontrada' });
    if (venda.status === 'CANCELADA') return reply.code(400).send({ erro: 'Venda ja cancelada' });

    try {
      await prisma.$transaction(async (tx) => {
        // Atualiza venda para CANCELADA
        await tx.venda.update({
          where: { id },
          data: {
            status: 'CANCELADA',
            canceladaEm: new Date(),
            canceladaPorId: req.usuario!.id,
            motivoCancelamento: parsed.data.motivo,
          },
        });

        // Estorna estoque
        for (const item of venda.itens) {
          const p = await tx.produto.findUnique({ where: { id: item.produtoId } });
          if (!p) continue;
          const saldoAnterior = p.estoqueAtual;
          const novoSaldo = saldoAnterior + item.quantidade;
          await tx.produto.update({
            where: { id: p.id },
            data: { estoqueAtual: novoSaldo },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: p.id,
              tipo: 'CANCELAMENTO_VENDA',
              quantidade: item.quantidade,
              saldoAnterior,
              saldoPosterior: novoSaldo,
              documentoRef: `Venda #${venda.numero}`,
              usuarioId: req.usuario!.id,
            },
          });
        }

        // Estorna caixa (se houve)
        if (venda.caixaId) {
          const totalPago = venda.pagamentos.reduce((acc, p) => p.forma !== 'FIADO' ? acc + p.valorCentavos : acc, 0);
          if (totalPago > 0) {
            await tx.movimentacaoCaixa.create({
              data: {
                caixaId: venda.caixaId,
                tipo: 'CANCELAMENTO',
                valorCentavos: -totalPago,
                descricao: `Cancelamento Venda #${venda.numero}`,
                usuarioId: req.usuario!.id,
              },
            });
          }
        }

        // Cancela contas a receber geradas por fiado
        await tx.contaReceber.updateMany({
          where: { vendaId: venda.id, status: 'PENDENTE' },
          data: { status: 'CANCELADO' },
        });

        await registrarAuditoria(tx, {
          usuarioId: req.usuario!.id, acao: 'VENDA_CANCELADA',
          entidade: 'Venda', entidadeId: id,
          dadosDepois: { motivo: parsed.data.motivo }, ip: req.ip,
        });
      });

      return reply.send({ ok: true });
    } catch (e: any) {
      return reply.code(500).send({ erro: e.message });
    }
  });
};
