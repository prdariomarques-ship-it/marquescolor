import { z } from 'zod';

export const itemOrcamentoSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  precoUnitarioCentavos: z.number().int().min(0),
  descontoItemCentavos: z.number().int().min(0).optional().default(0),
});

export const criarOrcamentoSchema = z.object({
  clienteId: z.string().optional().nullable(),
  validade: z.string().optional(),
  itens: z.array(itemOrcamentoSchema).min(1),
  descontoCentavos: z.number().int().min(0).optional().default(0),
  observacoes: z.string().optional().nullable(),
});

export type CriarOrcamentoInput = z.infer<typeof criarOrcamentoSchema>;
