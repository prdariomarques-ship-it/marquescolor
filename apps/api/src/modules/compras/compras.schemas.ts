import { z } from 'zod';

export const itemCompraSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  precoCustoCentavos: z.number().int().min(0),
});

export const criarCompraSchema = z.object({
  fornecedorId: z.string().min(1),
  numeroPedido: z.string().optional().nullable(),
  dataCompra: z.string().optional(),
  itens: z.array(itemCompraSchema).min(1),
  descontoCentavos: z.number().int().min(0).optional().default(0),
  freteCentavos: z.number().int().min(0).optional().default(0),
  formaPagamento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  status: z.enum(['RASCUNHO', 'CONFIRMADA']).optional().default('RASCUNHO'),
});

export const confirmarCompraSchema = z.object({}).optional();

export type CriarCompraInput = z.infer<typeof criarCompraSchema>;
