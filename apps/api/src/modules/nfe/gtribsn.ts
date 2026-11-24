// NT 2026.005 v1.00 (Simples Nacional sem regime regular): conferencia do gTribSN.
// Regras da NT: total do IBS (vIBSSN) e da CBS (vCBSSN) = soma dos itens (rejeicoes 1277 e 1284);
// total sem itens com gTribSN e itens com gTribSN sem total sao casos de rejeicao (1275 e 1276).
// Aqui NAO se rejeita: o leitor so devolve avisos para revisao.
import type { NfeExtraida } from './tipos.js';

export function conferirGTribSN(nfe: NfeExtraida): string[] {
  const avisos: string[] = [];
  const itens = nfe.itens.filter((i) => i.tributoSimplesIbsCentavos != null);
  const tot = nfe.totais;
  if (!itens.length && tot.gTribSNIbsCentavos == null) return avisos;
  if (!itens.length && tot.gTribSNIbsCentavos != null) {
    avisos.push('total com gTribSN e nenhum item com o grupo (NT 2026.005, rejeicao 1276)');
    return avisos;
  }
  if (itens.length && tot.gTribSNIbsCentavos == null) {
    avisos.push('itens com gTribSN e total sem o grupo (NT 2026.005, rejeicao 1275)');
    return avisos;
  }
  const somaIbs = itens.reduce((a, i) => a + (i.tributoSimplesIbsCentavos ?? 0), 0);
  const somaCbs = itens.reduce((a, i) => a + (i.tributoSimplesCbsCentavos ?? 0), 0);
  if (tot.gTribSNIbsCentavos !== somaIbs) {
    avisos.push(`IBS do Simples: total ${tot.gTribSNIbsCentavos} difere da soma dos itens ${somaIbs} (NT 2026.005, rejeicao 1277)`);
  }
  if (tot.gTribSNCbsCentavos !== somaCbs) {
    avisos.push(`CBS do Simples: total ${tot.gTribSNCbsCentavos} difere da soma dos itens ${somaCbs} (NT 2026.005, rejeicao 1284)`);
  }
  return avisos;
}
