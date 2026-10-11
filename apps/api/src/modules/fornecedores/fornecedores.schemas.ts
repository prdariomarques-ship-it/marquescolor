import { z } from 'zod';

export const criarFornecedorSchema = z.object({
  razaoSocial: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  cnpj: z.string().max(20).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  whatsapp: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  cep: z.string().max(10).optional().nullable(),
  endereco: z.string().max(200).optional().nullable(),
  numero: z.string().max(20).optional().nullable(),
  complemento: z.string().max(50).optional().nullable(),
  bairro: z.string().max(100).optional().nullable(),
  cidade: z.string().max(100).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  contato: z.string().max(100).optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
  ativo: z.boolean().optional().default(true),
});

export const atualizarFornecedorSchema = criarFornecedorSchema.partial();

export const fornecedorCsvRowSchema = z.object({
  razaoSocial: z.string().min(2),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  contato: z.string().optional(),
});

export type CriarFornecedorInput = z.infer<typeof criarFornecedorSchema>;
export type AtualizarFornecedorInput = z.infer<typeof atualizarFornecedorSchema>;
export type FornecedorCsvRow = z.infer<typeof fornecedorCsvRowSchema>;
