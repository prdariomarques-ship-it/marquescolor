import { z } from 'zod';

export const criarCategoriaSchema = z.object({
  nome: z.string().min(2).max(100),
  corHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar no formato #RRGGBB').optional().or(z.literal('')),
  ativo: z.boolean().optional().default(true),
});

export const atualizarCategoriaSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  corHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  ativo: z.boolean().optional(),
});

export type CriarCategoriaInput = z.infer<typeof criarCategoriaSchema>;
export type AtualizarCategoriaInput = z.infer<typeof atualizarCategoriaSchema>;
