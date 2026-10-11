import { z } from 'zod';

export const unidadeEnum = z.enum(['UN', 'L', 'KG', 'M', 'CX', 'GL', 'BD', 'LATAS']);

export const criarProdutoSchema = z.object({
  codigoInterno: z.string().min(1).max(50),
  codigoBarras: z.string().max(50).optional().nullable(),
  nome: z.string().min(2).max(200),
  descricao: z.string().max(2000).optional().nullable(),
  marcaId: z.string().optional().nullable(),
  categoriaId: z.string().optional().nullable(),
  subcategoria: z.string().max(100).optional().nullable(),
  unidade: unidadeEnum.optional().default('UN'),
  cor: z.string().max(100).optional().nullable(),
  acabamento: z.string().max(100).optional().nullable(),
  volume: z.string().max(100).optional().nullable(),
  precoCustoCentavos: z.number().int().min(0).optional().default(0),
  precoVendaCentavos: z.number().int().min(0).optional().default(0),
  estoqueMinimo: z.number().min(0).optional().default(0),
  estoqueMaximo: z.number().min(0).optional().default(0),
  localizacao: z.string().max(100).optional().nullable(),
  fornecedorPrincipalId: z.string().optional().nullable(),
  fotoUrl: z.string().url().optional().nullable(),
  ativo: z.boolean().optional().default(true),
}).refine(d => d.precoVendaCentavos >= d.precoCustoCentavos || d.precoVendaCentavos === 0, {
  message: 'Preco de venda deve ser >= preco de custo (ou zero)',
  path: ['precoVendaCentavos'],
});

export const atualizarProdutoSchema = z.object({
  codigoInterno: z.string().min(1).max(50).optional(),
  codigoBarras: z.string().max(50).optional().nullable(),
  nome: z.string().min(2).max(200).optional(),
  descricao: z.string().max(2000).optional().nullable(),
  marcaId: z.string().optional().nullable(),
  categoriaId: z.string().optional().nullable(),
  subcategoria: z.string().max(100).optional().nullable(),
  unidade: unidadeEnum.optional(),
  cor: z.string().max(100).optional().nullable(),
  acabamento: z.string().max(100).optional().nullable(),
  volume: z.string().max(100).optional().nullable(),
  precoCustoCentavos: z.number().int().min(0).optional(),
  precoVendaCentavos: z.number().int().min(0).optional(),
  estoqueMinimo: z.number().min(0).optional(),
  estoqueMaximo: z.number().min(0).optional(),
  localizacao: z.string().max(100).optional().nullable(),
  fornecedorPrincipalId: z.string().optional().nullable(),
  fotoUrl: z.string().url().optional().nullable(),
  ativo: z.boolean().optional(),
});

// Schema para importacao CSV — cada linha do CSV
export const produtoCsvRowSchema = z.object({
  codigoInterno: z.string().min(1),
  codigoBarras: z.string().optional(),
  nome: z.string().min(2),
  descricao: z.string().optional(),
  marcaNome: z.string().optional(),  // resolve por nome, nao por id
  categoriaNome: z.string().optional(),
  unidade: z.string().optional().default('UN'),
  cor: z.string().optional(),
  acabamento: z.string().optional(),
  volume: z.string().optional(),
  precoCustoCentavos: z.coerce.number().int().min(0).optional().default(0),
  precoVendaCentavos: z.coerce.number().int().min(0).optional().default(0),
  estoqueAtual: z.coerce.number().min(0).optional().default(0),
  estoqueMinimo: z.coerce.number().min(0).optional().default(0),
  estoqueMaximo: z.coerce.number().min(0).optional().default(0),
  localizacao: z.string().optional(),
});

export type CriarProdutoInput = z.infer<typeof criarProdutoSchema>;
export type AtualizarProdutoInput = z.infer<typeof atualizarProdutoSchema>;
export type ProdutoCsvRow = z.infer<typeof produtoCsvRowSchema>;
