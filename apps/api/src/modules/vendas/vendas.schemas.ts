import { z } from 'zod';

export const itemVendaSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  precoUnitarioCentavos: z.number().int().min(0),
  descontoItemCentavos: z.number().int().min(0).optional().default(0),
});

export const pagamentoSchema = z.object({
  forma: z.enum(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO']),
  valorCentavos: z.number().int().min(0),
  parcelas: z.number().int().min(1).optional().default(1),
  bandeira: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export const finalizarVendaSchema = z.object({
  clienteId: z.string().optional().nullable(),
  itens: z.array(itemVendaSchema).min(1),
  pagamentos: z.array(pagamentoSchema).min(1),
  descontoGeralCentavos: z.number().int().min(0).optional().default(0),
  acrescimoCentavos: z.number().int().min(0).optional().default(0),
  caixaId: z.string().optional().nullable(),
  valorRecebidoCentavos: z.number().int().min(0).optional(),
}).refine(d => {
  const totalItens = d.itens.reduce((acc, it) => acc + (it.precoUnitarioCentavos * it.quantidade - it.descontoItemCentavos), 0);
  const total = Math.max(0, totalItens - d.descontoGeralCentavos + d.acrescimoCentavos);
  const totalPag = d.pagamentos.reduce((acc, p) => acc + p.valorCentavos, 0);
  // Pagamentos devem cobrir o total, salvo se houver FIADO
  const temFiado = d.pagamentos.some(p => p.forma === 'FIADO');
  if (temFiado) return true;
  return totalPag >= total;
}, { message: 'Pagamentos insuficientes para cobrir o total', path: ['pagamentos'] });

export const cancelarVendaSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export type FinalizarVendaInput = z.infer<typeof finalizarVendaSchema>;
export type CancelarVendaInput = z.infer<typeof cancelarVendaSchema>;
