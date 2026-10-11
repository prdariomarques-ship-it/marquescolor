import { z } from 'zod';

export const criarClienteSchema = z.object({
  nome: z.string().min(2).max(200),
  cpfCnpj: z.string().max(20).optional().nullable(),
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
  observacoes: z.string().max(2000).optional().nullable(),
  limiteCreditoCentavos: z.number().int().min(0).optional().default(0),
  ativo: z.boolean().optional().default(true),
});

export const atualizarClienteSchema = criarClienteSchema.partial();

export const clienteCsvRowSchema = z.object({
  nome: z.string().min(2),
  cpfCnpj: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  cep: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  limiteCreditoCentavos: z.coerce.number().int().min(0).optional().default(0),
});

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;
export type AtualizarClienteInput = z.infer<typeof atualizarClienteSchema>;
export type ClienteCsvRow = z.infer<typeof clienteCsvRowSchema>;
