// Classificacao heuristica de mensagens por palavras-chave (porte de
// email_classifier.py). NAO e IA e NAO e validacao fiscal: serve para encaminhar a
// mensagem a fila certa. Quando ha anexo NF-e (XML) o sinal forte e o proprio
// conteudo do anexo, decidido em ingestao-email.ts, nao este classificador.
import type { CategoriaEmail } from '../documentos/classificador.js';

export interface ClassificacaoEmail {
  categoria: CategoriaEmail;
  confianca: number;
  palavras: string[];
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const NFE = ['nota fiscal', 'nf-e', 'nfe', 'danfe', 'xml da nota', 'chave de acesso'];
const FINANCEIRO = ['boleto', 'fatura', 'cobranca', 'vencimento', 'pagamento', 'duplicata'];
const PEDIDO = ['pedido', 'cotacao', 'orcamento', 'proposta comercial'];
const SPAM = ['descadastrar', 'unsubscribe', 'promocao imperdivel', 'compre agora', 'oferta exclusiva', 'ganhe desconto'];

export function classificarEmail(e: { assunto: string | null; corpo: string | null; temAnexoDocumento: boolean; remetenteConhecido: boolean }): ClassificacaoEmail {
  const h = normalizar(`${e.assunto ?? ''} ${e.corpo ?? ''}`);
  const hit = (lista: string[]) => lista.filter((k) => h.includes(k));
  const spam = hit(SPAM);
  if (spam.length) return { categoria: 'SPAM', confianca: 0.6, palavras: spam };
  const nfe = hit(NFE);
  if (nfe.length && e.temAnexoDocumento) return { categoria: 'NF_E', confianca: 0.75, palavras: nfe };
  const fin = hit(FINANCEIRO);
  if (fin.length) return { categoria: 'FINANCEIRO', confianca: 0.7, palavras: fin };
  const ped = hit(PEDIDO);
  if (ped.length && e.remetenteConhecido) return { categoria: 'PEDIDO_FORNECEDOR', confianca: 0.75, palavras: ped };
  if (nfe.length) return { categoria: 'NF_E', confianca: 0.4, palavras: nfe };
  return { categoria: 'DESCONHECIDO', confianca: 0, palavras: [] };
}
