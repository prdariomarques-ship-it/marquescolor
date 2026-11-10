// Calculo de divergencias e pendencias de um documento ja persistido.
// Funcao PURA: recebe linhas do banco e devolve o conjunto desejado de itens de
// revisao. Nao grava nada, nao toca em custo, preco ou estoque.
import { multiplicarParaCentavos } from './decimal.js';
import type { RevisaoDesejada } from './log.js';

export interface DocParaRevisao {
  id: string;
  fonteDados: string;
  chaveAcesso: string | null;
  chaveValida: boolean;
  fornecedorId: string | null;
  emitenteCnpj: string | null;
  emitenteNome: string | null;
  destinatarioCnpj: string | null;
  protocoloAutorizacao: string | null;
  valorProdutosCentavos: number;
  valorFreteCentavos: number;
  valorSeguroCentavos: number;
  valorDescontoCentavos: number;
  valorOutrasCentavos: number;
  valorIpiCentavos: number;
  valorIcmsStCentavos: number;
  valorTotalCentavos: number;
}

export interface ItemParaRevisao {
  id: string;
  numeroItem: number;
  codigoFornecedor: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
  csosn: string | null;
  unidade: string | null;
  quantidadeOriginal: string;
  valorUnitarioOriginal: string;
  valorUnitarioCentavos: number;
  valorTotalCentavos: number;
  statusVinculo: string;
  produto?: { id: string; precoCustoCentavos: number; unidade: string } | null;
}

export interface ParametrosDivergencia {
  toleranciaCentavos: number;
  limiteVariacaoCustoPct: number;
  cnpjLoja: string;
}

const brl = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function calcularRevisoes(doc: DocParaRevisao, itens: ItemParaRevisao[], p: ParametrosDivergencia): RevisaoDesejada[] {
  const out: RevisaoDesejada[] = [];
  const nfe = (motivo: string, severidade: 'BLOQUEANTE' | 'ALERTA', detalhe: string, dados?: unknown) =>
    out.push({ documentoId: doc.id, entidadeTipo: 'NFE', entidadeId: doc.id, motivo, severidade, detalhe, dados });

  if (doc.fonteDados !== 'XML') {
    nfe('FONTE_NAO_XML', 'BLOQUEANTE',
      `Dados lidos de ${doc.fonteDados === 'OCR' ? 'OCR' : 'texto de PDF'}, nao de XML. Conferir cada campo contra o documento original ou importar o XML da nota.`);
  }
  if (doc.chaveAcesso && !doc.chaveValida) {
    nfe('CHAVE_INVALIDA', 'BLOQUEANTE', 'Chave de acesso com formato, digito verificador ou dados incoerentes com os campos da nota.', { chave: doc.chaveAcesso });
  }
  if (!doc.chaveAcesso) {
    nfe('CHAVE_AUSENTE', 'BLOQUEANTE', 'Chave de acesso nao identificada; sem ela nao e possivel detectar duplicidade com seguranca.');
  }
  if (!doc.fornecedorId) {
    nfe('FORNECEDOR_DESCONHECIDO', 'BLOQUEANTE',
      `Emitente ${doc.emitenteNome ?? '?'} (CNPJ ${doc.emitenteCnpj ?? '?'}) nao esta cadastrado como fornecedor. Cadastre-o e vincule; o sistema nao cadastra fornecedores sozinho.`,
      { cnpj: doc.emitenteCnpj, nome: doc.emitenteNome });
  }
  if (p.cnpjLoja && doc.destinatarioCnpj && doc.destinatarioCnpj !== p.cnpjLoja) {
    nfe('DESTINATARIO_DIVERGENTE', 'BLOQUEANTE', `Destinatario ${doc.destinatarioCnpj} difere do CNPJ da loja.`, { destinatario: doc.destinatarioCnpj, loja: p.cnpjLoja });
  }
  if (doc.fonteDados === 'XML' && !doc.protocoloAutorizacao) {
    nfe('PROTOCOLO_AUSENTE', 'ALERTA', 'XML sem protocolo de autorizacao (protNFe). Confirmar a situacao da nota na SEFAZ; este sistema nao consulta a SEFAZ.');
  }

  const somaItens = itens.reduce((a, i) => a + i.valorTotalCentavos, 0);
  if (itens.length && Math.abs(somaItens - doc.valorProdutosCentavos) > p.toleranciaCentavos) {
    nfe('DIVERGENCIA_TOTAL_PRODUTOS', 'BLOQUEANTE',
      `Soma dos itens R$ ${brl(somaItens)} difere do total de produtos informado R$ ${brl(doc.valorProdutosCentavos)}.`,
      { somaItens, informado: doc.valorProdutosCentavos });
  }
  const esperadoNota = doc.valorProdutosCentavos - doc.valorDescontoCentavos + doc.valorFreteCentavos + doc.valorSeguroCentavos
    + doc.valorOutrasCentavos + doc.valorIpiCentavos + doc.valorIcmsStCentavos;
  if (doc.valorTotalCentavos > 0 && Math.abs(esperadoNota - doc.valorTotalCentavos) > p.toleranciaCentavos) {
    nfe('DIVERGENCIA_TOTAL_NOTA', 'ALERTA',
      `Total da nota R$ ${brl(doc.valorTotalCentavos)} difere de produtos - desconto + frete + seguro + outras + IPI + ST = R$ ${brl(esperadoNota)} (pode haver componentes nao lidos, ex.: II/FCP).`,
      { esperado: esperadoNota, informado: doc.valorTotalCentavos });
  }

  for (const it of itens) {
    const item = (motivo: string, severidade: 'BLOQUEANTE' | 'ALERTA', detalhe: string, dados?: unknown) =>
      out.push({ documentoId: doc.id, entidadeTipo: 'NFE_ITEM', entidadeId: it.id, motivo, severidade, detalhe, dados });
    const rot = `item ${it.numeroItem} (${it.descricao ?? it.codigoFornecedor ?? 's/ descricao'})`;

    if (it.statusVinculo === 'SEM_CORRESPONDENCIA') {
      item('PRODUTO_DESCONHECIDO', 'BLOQUEANTE',
        `${rot}: sem produto correspondente (codigo do fornecedor ${it.codigoFornecedor ?? '-'}). Vincule a um produto existente ou cadastre o produto; o sistema nao cadastra nem adivinha.`,
        { codigoFornecedor: it.codigoFornecedor, descricao: it.descricao });
    } else if (it.statusVinculo === 'SUGERIDO') {
      item('PRODUTO_SUGERIDO_CONFIRMAR', 'BLOQUEANTE', `${rot}: correspondencia sugerida apenas por GTIN exato; confirme manualmente.`);
    }

    const esperado = multiplicarParaCentavos(it.quantidadeOriginal, it.valorUnitarioOriginal);
    if (esperado !== null && Math.abs(esperado - it.valorTotalCentavos) > p.toleranciaCentavos) {
      item('DIVERGENCIA_VALOR_ITEM', 'BLOQUEANTE',
        `${rot}: qtd ${it.quantidadeOriginal} x unit ${it.valorUnitarioOriginal} = R$ ${brl(esperado)}, mas o valor do item e R$ ${brl(it.valorTotalCentavos)}.`,
        { esperado, informado: it.valorTotalCentavos });
    }

    if (!it.ncm || !it.cfop || (!it.cst && !it.csosn)) {
      const faltam = [!it.ncm && 'NCM', !it.cfop && 'CFOP', (!it.cst && !it.csosn) && 'CST/CSOSN'].filter(Boolean).join(', ');
      item('DADOS_FISCAIS_INCOMPLETOS', 'ALERTA', `${rot}: dados fiscais ausentes: ${faltam}.`);
    }

    if (it.produto && ['MAPEADO', 'CONFIRMADO', 'SUGERIDO'].includes(it.statusVinculo)) {
      if (it.produto.precoCustoCentavos > 0 && it.valorUnitarioCentavos > 0) {
        const variacao = ((it.valorUnitarioCentavos - it.produto.precoCustoCentavos) / it.produto.precoCustoCentavos) * 100;
        if (Math.abs(variacao) > p.limiteVariacaoCustoPct) {
          item('DIVERGENCIA_PRECO_CUSTO', 'ALERTA',
            `${rot}: valor unitario da NF R$ ${brl(it.valorUnitarioCentavos)} varia ${variacao.toFixed(1)}% frente ao custo atual R$ ${brl(it.produto.precoCustoCentavos)}. Apenas informativo: o custo NAO e atualizado por este modulo.`,
            { unitarioNf: it.valorUnitarioCentavos, custoAtual: it.produto.precoCustoCentavos, variacaoPct: Number(variacao.toFixed(2)) });
        }
      }
      if (it.unidade && it.produto.unidade && it.unidade.toUpperCase() !== it.produto.unidade.toUpperCase()) {
        item('UNIDADE_DIVERGENTE', 'ALERTA', `${rot}: unidade da NF (${it.unidade}) difere da unidade do produto (${it.produto.unidade}); conferir fator de conversao antes de receber.`);
      }
    }
  }
  return out;
}
