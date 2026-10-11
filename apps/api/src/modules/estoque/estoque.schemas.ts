import { z } from 'zod';

export const movimentacaoSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number(),  // positivo ou negativo conforme tipo
  motivo: z.string().max(500).optional().nullable(),
  documentoRef: z.string().max(100).optional().nullable(),
}).refine(d => d.quantidade !== 0, {
  message: 'Quantidade nao pode ser zero',
  path: ['quantidade'],
});

// Para entrada manual
export const entradaSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  motivo: z.string().max(500).optional().nullable(),
  documentoRef: z.string().max(100).optional().nullable(),
});

// Para saida manual (perda, avaria)
export const saidaSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  tipo: z.enum(['SAIDA_PERDA', 'SAIDA_AVARIA']),
  motivo: z.string().max(500),
  documentoRef: z.string().max(100).optional().nullable(),
});

// Para ajuste manual (motivo obrigatorio)
export const ajusteSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number(),  // pode ser positivo ou negativo
  motivo: z.string().min(3).max(500),
  documentoRef: z.string().max(100).optional().nullable(),
});

export type EntradaInput = z.infer<typeof entradaSchema>;
export type SaidaInput = z.infer<typeof saidaSchema>;
export type AjusteInput = z.infer<typeof ajusteSchema>;
