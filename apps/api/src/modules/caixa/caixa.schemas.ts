import { z } from 'zod';

export const abrirCaixaSchema = z.object({
  valorAberturaCentavos: z.number().int().min(0).optional().default(0),
  observacao: z.string().optional().nullable(),
});

export const movimentacaoCaixaSchema = z.object({
  tipo: z.enum(['SANGRIA', 'SUPRIMENTO', 'DESPESA']),
  valorCentavos: z.number().int().positive(),
  descricao: z.string().min(3).max(200),
});

export const fecharCaixaSchema = z.object({
  valorFechamentoInformadoCentavos: z.number().int().min(0),
  observacao: z.string().optional().nullable(),
});

export type AbrirCaixaInput = z.infer<typeof abrirCaixaSchema>;
export type MovimentacaoCaixaInput = z.infer<typeof movimentacaoCaixaSchema>;
export type FecharCaixaInput = z.infer<typeof fecharCaixaSchema>;
