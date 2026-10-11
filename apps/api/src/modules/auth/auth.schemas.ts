import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(3).max(50),
  senha: z.string().min(1).max(100),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1).max(100),
  novaSenha: z.string().min(6).max(100),
  confirmar: z.string().min(6).max(100),
}).refine(d => d.novaSenha === d.confirmar, {
  message: 'Confirmacao deve igualar novaSenha',
  path: ['confirmar'],
}).refine(d => d.novaSenha !== d.senhaAtual, {
  message: 'Nova senha deve ser diferente da atual',
  path: ['novaSenha'],
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10),
});

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2).max(100),
  login: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Login deve conter apenas letras, numeros, pontos, tracos e underscores'),
  senha: z.string().min(6).max(100),
  papel: z.enum(['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA']),
  ativo: z.boolean().optional().default(true),
});

export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  papel: z.enum(['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA']).optional(),
  ativo: z.boolean().optional(),
});

export const redefinirSenhaSchema = z.object({
  novaSenha: z.string().min(6).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;
