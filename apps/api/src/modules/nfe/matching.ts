// Correspondencia NF-e item -> produto interno.
// UNICO sinal automatico confiavel: mapa (fornecedor, codigo do fornecedor) -> produto,
// criado SOMENTE por decisao humana. GTIN exato e apenas SUGESTAO (exige confirmacao).
// Nao ha comparacao difusa/por nome: uma correspondencia errada mistura estoques
// de produtos diferentes sem ninguem perceber (regra herdada do backend Python).
import type { Db } from './log.js';

export interface ResultadoMatch {
  produtoId: string | null;
  status: 'MAPEADO' | 'SUGERIDO' | 'SEM_CORRESPONDENCIA';
  origem: 'MAPA_FORNECEDOR' | 'GTIN' | null;
}

export async function resolverProduto(
  db: Db,
  p: { fornecedorId: string | null; codigoFornecedor: string | null; gtin: string | null },
): Promise<ResultadoMatch> {
  if (p.fornecedorId && p.codigoFornecedor) {
    const mapa = await db.produtoFornecedorMap.findUnique({
      where: { fornecedorId_codigoFornecedor: { fornecedorId: p.fornecedorId, codigoFornecedor: p.codigoFornecedor } },
      include: { produto: true },
    });
    if (mapa && mapa.produto.ativo) return { produtoId: mapa.produtoId, status: 'MAPEADO', origem: 'MAPA_FORNECEDOR' };
  }
  if (p.gtin) {
    const produtos = await db.produto.findMany({ where: { codigoBarras: p.gtin, ativo: true }, take: 2 });
    if (produtos.length === 1) return { produtoId: produtos[0].id, status: 'SUGERIDO', origem: 'GTIN' };
  }
  return { produtoId: null, status: 'SEM_CORRESPONDENCIA', origem: null };
}
