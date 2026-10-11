import { z } from 'zod';

export const criarMarcaSchema = z.object({
  nome: z.string().min(2).max(100),
  ativo: z.boolean().optional().default(true),
});

export const atualizarMarcaSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  ativo: z.boolean().optional(),
});

export type CriarMarcaInput = z.infer<typeof criarMarcaSchema>;
export type AtualizarMarcaInput = z.infer<typeof atualizarMarcaSchema>;
