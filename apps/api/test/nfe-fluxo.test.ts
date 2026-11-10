import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { estoqueGatewayPadrao, type EstoqueGateway } from '../src/modules/nfe/servico.js';
import { auth, criarFornecedor, criarProduto, criarUsuarios, limparBancoNfe, login, multipart, upload } from './helpers/app-helpers.js';
import { linhasDanfe } from './helpers/pdf-fixtures.js';
import { CNPJ_FORNECEDOR, CNPJ_LOJA, montarXmlEventoCancelamento, montarXmlNfe } from './helpers/nfe-fixtures.js';

let app: FastifyInstance;
let gerente: string;
let vendedor: string;
let admin: string;
// gateway de estoque controlavel pelos testes (falha simulada)
let estoqueFalha = false;
const gatewayDeTeste: EstoqueGateway = {
  async entrada(tx, p) {
    if (estoqueFalha) throw new Error('indisponibilidade simulada do estoque');
    return estoqueGatewayPadrao.entrada(tx, p);
  },
};

before(async () => {
  process.env.LOJA_CNPJ = CNPJ_LOJA;
  await limparBancoNfe();
  await criarUsuarios();
  app = await buildApp({ logger: false, nfe: { deps: { estoque: gatewayDeTeste } } });
  await app.ready();
  admin = await login(app, 'admin', 'admin-123');
  gerente = await login(app, 'gerente', 'ger-123');
  vendedor = await login(app, 'vendedor', 'ven-123');
});

after(async () => {
  await app.close();
  await limparBancoNfe();
});

beforeEach(async () => {
  estoqueFalha = false;
  // preserva usuarios; limpa o resto
  await prisma.processingLog.deleteMany();
  await prisma.reviewQueueItem.deleteMany();
  await prisma.nfeItem.deleteMany();
  await prisma.produtoFornecedorMap.deleteMany();
  await prisma.nfeDocument.deleteMany();
  await prisma.documentoArquivo.deleteMany();
  await prisma.emailMensagem.deleteMany();
  await prisma.itemCompra.deleteMany();
  await prisma.compra.deleteMany();
  await prisma.movimentacaoEstoque.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.fornecedor.deleteMany();
});

const post = (url: string, token: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: { ...auth(token), 'content-type': 'application/json' }, payload: JSON.stringify(payload ?? {}) });
const get = (url: string, token: string) => app.inject({ method: 'GET', url, headers: auth(token) });
const xmlBuf = (o?: Parameters<typeof montarXmlNfe>[0]) => Buffer.from(montarXmlNfe(o).xml);

async function enviarXml(o?: Parameters<typeof montarXmlNfe>[0], token = gerente) {
  const r = await upload(app, token, 'nota.xml', 'text/xml', xmlBuf(o));
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.resultados[0] as any;
}
async function doc(id: string) {
  return (await get(`/api/nfe/documentos/${id}`, gerente)).json() as any;
}

// Prepara um cenario completo "aprovavel": fornecedor + produto mapeado
async function cenarioAprovavel(extra: { custo?: number; estoque?: number; qtd?: string; unit?: string; numero?: number } = {}) {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Tinta Acrilica Fosco 18L Branco', custo: extra.custo ?? 1250, estoque: extra.estoque ?? 5 });
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '00012', produtoId: p.id } });
  const r = await enviarXml({ numero: extra.numero ?? 1001, itens: [{ codigo: '00012', descricao: 'TINTA ACRILICA FOSCO 18L BRANCO', quantidade: extra.qtd ?? '10.0000', valorUnitario: extra.unit ?? '12.5000000000' }] });
  return { f, p, r, docId: r.documentoIds[0] as string };
}

test('XML valido: arquivo original preservado, documento interpretado, dados fiscais completos', async () => {
  const r = await enviarXml({
    numero: 77,
    itens: [{ codigo: '00012', descricao: 'TINTA ACRILICA', ncm: '32091010', cest: '1000100', cfop: '5102', quantidade: '3.0000', valorUnitario: '12.3456789000', csosn: '102', gtin: '7891234567895' }],
    duplicatas: [{ n: '001', venc: '2026-11-20', v: '37.04' }],
  });
  assert.equal(r.status, 'INTERPRETADO');
  assert.equal(r.metodo, 'XML');
  assert.equal(r.documentoIds.length, 1);
  const d = await doc(r.documentoIds[0]);
  assert.equal(d.chaveValida, true);
  assert.equal(d.fonteDados, 'XML');
  assert.equal(d.numero, '77');
  assert.equal(d.itens[0].codigoFornecedor, '00012');
  assert.equal(d.itens[0].valorUnitarioOriginal, '12.3456789000');
  assert.equal(d.itens[0].ncm, '32091010');
  assert.equal(d.itens[0].cest, '1000100');
  assert.equal(d.itens[0].csosn, '102');
  assert.ok(d.itens[0].impostosJson.includes('ICMSSN102'), 'impostos originais preservados');
  assert.equal(JSON.parse(d.pagamentoJson).duplicatas[0].vencimento, '2026-11-20');
  // original preservado e integro
  const orig = await app.inject({ method: 'GET', url: `/api/nfe/arquivos/${r.arquivoId}/original`, headers: auth(gerente) });
  assert.equal(orig.statusCode, 200);
  assert.equal(orig.rawPayload.toString('utf8'), montarXmlNfe({ numero: 77, itens: [{ codigo: '00012', descricao: 'TINTA ACRILICA', ncm: '32091010', cest: '1000100', cfop: '5102', quantidade: '3.0000', valorUnitario: '12.3456789000', csosn: '102', gtin: '7891234567895' }], duplicatas: [{ n: '001', venc: '2026-11-20', v: '37.04' }] }).xml);
  assert.equal(d.estoqueAtualizadoEm, null);
  assert.equal(d.statusEstoque, 'NAO_APLICADO');
});

test('XML invalido: nada e criado, arquivo vai para a fila de revisao, original preservado', async () => {
  const r = await upload(app, gerente, 'quebrado.xml', 'text/xml', Buffer.from('<nfeProc><NFe><infNFe></NFe>'));
  const res = r.corpo.resultados[0];
  assert.equal(res.status, 'FALHA');
  assert.equal(res.erro.codigo, 'XML_MAL_FORMADO');
  assert.equal(await prisma.nfeDocument.count(), 0);
  const fila = (await get('/api/nfe/fila-revisao', gerente)).json() as any;
  assert.ok(fila.data.some((x: any) => x.motivo === 'ARQUIVO_SEM_DADOS' && x.entidadeId === res.arquivoId));
  assert.equal((await prisma.documentoArquivo.findUnique({ where: { id: res.arquivoId } }))?.status, 'FALHA');
});

test('NF-e duplicada: mesmo arquivo (SHA-256) e mesmo conteudo fiscal em outro arquivo nao duplicam', async () => {
  const { xml } = montarXmlNfe({ numero: 500 });
  const a = (await upload(app, gerente, 'a.xml', 'text/xml', Buffer.from(xml))).corpo.resultados[0];
  const b = (await upload(app, gerente, 'a-copia.xml', 'text/xml', Buffer.from(xml))).corpo.resultados[0];
  assert.equal(b.duplicado, true);
  assert.equal(b.arquivoId, a.arquivoId);
  assert.deepEqual(b.documentoIds, a.documentoIds);
  // mesma NF-e, bytes diferentes (ex.: reenviada sem protocolo): detecta pela CHAVE
  const semProt = montarXmlNfe({ numero: 500, semProtocolo: true }).xml;
  const c = (await upload(app, gerente, 'b.xml', 'text/xml', Buffer.from(semProt))).corpo.resultados[0];
  assert.equal(c.duplicado, false);
  assert.equal(c.acao, 'DUPLICADO');
  assert.deepEqual(c.documentoIds, a.documentoIds);
  assert.equal(await prisma.nfeDocument.count(), 1);
  assert.ok((await prisma.processingLog.count({ where: { acao: 'SKIP_DUPLICATE_CHAVE' } })) >= 1);
});

test('chave invalida (DV errado) gera pendencia bloqueante e impede aprovacao', async () => {
  await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ custo: 1000 });
  const f = await prisma.fornecedor.findFirstOrThrow();
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '1', produtoId: p.id } });
  const r = await enviarXml({ numero: 610, dvErrado: true, itens: [{ codigo: '1', quantidade: '1.0000', valorUnitario: '10.0000000000' }] });
  const d = await doc(r.documentoIds[0]);
  assert.equal(d.chaveValida, false);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'CHAVE_INVALIDA' && x.status === 'ABERTO' && x.severidade === 'BLOQUEANTE'));
  assert.equal((await post(`/api/nfe/documentos/${d.id}/aprovar`, gerente, { reconheceAlertas: true })).statusCode, 422);
});

test('fornecedor desconhecido: pendencia bloqueante, NAO cadastra fornecedor sozinho, aprovacao recusada', async () => {
  const r = await enviarXml({ numero: 11 });
  const d = await doc(r.documentoIds[0]);
  assert.equal(d.fornecedorId, null);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FORNECEDOR_DESCONHECIDO' && x.severidade === 'BLOQUEANTE'));
  assert.equal(await prisma.fornecedor.count(), 0);
  const ap = await post(`/api/nfe/documentos/${d.id}/aprovar`, gerente, { reconheceAlertas: true });
  assert.equal(ap.statusCode, 422);
  // o motivo nao pode ser "aceito" manualmente
  const rev = d.revisoes.find((x: any) => x.motivo === 'FORNECEDOR_DESCONHECIDO');
  const dis = await post(`/api/nfe/fila-revisao/${rev.id}/resolver`, gerente, { decisao: 'DISPENSAR', observacao: 'tentando ignorar' });
  assert.equal(dis.statusCode, 422);
  // cadastrado o fornecedor (fluxo humano), o reprocessamento o identifica por CNPJ
  await criarFornecedor(CNPJ_FORNECEDOR, 'Distribuidora Ficticia', false);
  const rec = (await post(`/api/nfe/documentos/${d.id}/reconciliar`, gerente)).json() as any;
  assert.ok(rec.fornecedorId);
  assert.ok(!rec.revisoes.some((x: any) => x.motivo === 'FORNECEDOR_DESCONHECIDO' && x.status === 'ABERTO'));
});

test('produto conhecido (mapa do fornecedor) x produto desconhecido: sem cadastro automatico nem correspondencia inventada', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Tinta Acrilica Fosco 18L Branco', custo: 1250 });
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '00012', produtoId: p.id } });
  // produto parecido pelo NOME, mas sem mapa: nao pode ser vinculado
  await criarProduto({ nome: 'Selador Acrilico 18L' });
  const antes = await prisma.produto.count();
  const r = await enviarXml({ numero: 21, itens: [
    { codigo: '00012', descricao: 'TINTA ACRILICA FOSCO 18L BRANCO', quantidade: '2.0000', valorUnitario: '12.5000000000' },
    { codigo: '99999', descricao: 'SELADOR ACRILICO 18L', quantidade: '1.0000', valorUnitario: '30.0000000000' },
  ] });
  const d = await doc(r.documentoIds[0]);
  const [i1, i2] = d.itens;
  assert.equal(i1.statusVinculo, 'MAPEADO');
  assert.equal(i1.produtoId, p.id);
  assert.equal(i1.vinculoOrigem, 'MAPA_FORNECEDOR');
  assert.equal(i2.statusVinculo, 'SEM_CORRESPONDENCIA');
  assert.equal(i2.produtoId, null);
  assert.equal(await prisma.produto.count(), antes, 'nenhum produto cadastrado automaticamente');
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'PRODUTO_DESCONHECIDO' && x.entidadeId === i2.id));
  assert.equal(d.statusCompra, 'NAO_PREPARADA');
});

test('GTIN exato apenas SUGERE; exige confirmacao humana (e o mapa so nasce da decisao humana)', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Produto com EAN', codigoBarras: '7891234567895' });
  const r = await enviarXml({ numero: 31, itens: [{ codigo: 'ABC-1', descricao: 'ALGUMA COISA', gtin: '7891234567895', quantidade: '1.0000', valorUnitario: '10.0000000000' }] });
  const d = await doc(r.documentoIds[0]);
  assert.equal(d.itens[0].statusVinculo, 'SUGERIDO');
  assert.equal(d.itens[0].vinculoOrigem, 'GTIN');
  assert.equal(d.statusCompra, 'NAO_PREPARADA');
  assert.equal(await prisma.produtoFornecedorMap.count(), 0);
  const v = await post(`/api/nfe/itens/${d.itens[0].id}/vincular-produto`, gerente, { produtoId: p.id, criarMapeamento: true });
  assert.equal(v.statusCode, 200, v.body);
  const d2 = v.json() as any;
  assert.equal(d2.itens[0].statusVinculo, 'CONFIRMADO');
  assert.equal(await prisma.produtoFornecedorMap.count({ where: { fornecedorId: f.id, codigoFornecedor: 'ABC-1' } }), 1);
  assert.equal(d2.statusCompra, 'PREPARADA');
});

test('divergencias: valor do item, total de produtos e preco versus custo atual', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Produto', custo: 1000 }); // custo atual R$ 10,00
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '1', produtoId: p.id } });
  // item: 2 x 12.50 = 25.00, mas vProd informado 30.00 (divergente); unit 12.50 e +25% sobre o custo atual
  const r = await enviarXml({ numero: 41, itens: [{ codigo: '1', quantidade: '2.0000', valorUnitario: '12.5000000000', valorTotal: '30.00' }] });
  const d = await doc(r.documentoIds[0]);
  const motivos = d.revisoes.map((x: any) => x.motivo);
  assert.ok(motivos.includes('DIVERGENCIA_VALOR_ITEM'));
  assert.ok(motivos.includes('DIVERGENCIA_PRECO_CUSTO'));
  const preco = d.revisoes.find((x: any) => x.motivo === 'DIVERGENCIA_PRECO_CUSTO');
  assert.equal(preco.severidade, 'ALERTA');
  assert.equal(JSON.parse(preco.dadosJson).variacaoPct, 25);
  assert.equal(d.revisoes.find((x: any) => x.motivo === 'DIVERGENCIA_VALOR_ITEM').severidade, 'BLOQUEANTE');
  // o custo do produto NAO muda
  assert.equal((await prisma.produto.findUnique({ where: { id: p.id } }))?.precoCustoCentavos, 1000);
  // total de produtos do cabecalho diferente da soma dos itens
  const r2 = await enviarXml({ numero: 42, itens: [{ codigo: '1', quantidade: '1.0000', valorUnitario: '10.0000000000' }] });
  const xmlAdulterado = montarXmlNfe({ numero: 43, itens: [{ codigo: '1', quantidade: '1.0000', valorUnitario: '10.0000000000' }] }).xml.replace('<vProd>10.00</vProd><vFrete>', '<vProd>99.00</vProd><vFrete>');
  const r3 = (await upload(app, gerente, 'adulterado.xml', 'text/xml', Buffer.from(xmlAdulterado))).corpo.resultados[0];
  const d3 = await doc(r3.documentoIds[0]);
  assert.ok(d3.revisoes.some((x: any) => x.motivo === 'DIVERGENCIA_TOTAL_PRODUTOS' && x.severidade === 'BLOQUEANTE'));
  void r2;
});

test('divergencia de destinatario (nota de outro CNPJ) e bloqueante', async () => {
  const r = await enviarXml({ numero: 51, cnpjDestinatario: '45997418000153' });
  const d = await doc(r.documentoIds[0]);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'DESTINATARIO_DIVERGENTE' && x.severidade === 'BLOQUEANTE'));
});

test('fluxo completo: aprovacao humana -> compra aguardando -> recebimento fisico -> estoque; custo/preco intocados', async () => {
  const { p, docId } = await cenarioAprovavel({ custo: 1250, estoque: 5 });
  let d = await doc(docId);
  assert.equal(d.statusCompra, 'PREPARADA');
  assert.equal(d.statusConferencia, 'PENDENTE');

  // vendedor nao aprova
  assert.equal((await post(`/api/nfe/documentos/${docId}/aprovar`, vendedor, {})).statusCode, 403);
  // compra preparada e visivel sem efeito algum
  const prep = (await get(`/api/nfe/documentos/${docId}/compra-preparada`, gerente)).json() as any;
  assert.equal(prep.itens.length, 1);
  assert.equal(await prisma.compra.count(), 0);

  const ap = await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { observacao: 'conferido com a nota fisica', reconheceAlertas: true });
  assert.equal(ap.statusCode, 200, ap.body);
  d = await doc(docId);
  assert.equal(d.statusCompra, 'APROVADA');
  assert.equal(d.statusConferencia, 'CONFERIDA');
  assert.ok(d.aprovadoEm);
  const compra = await prisma.compra.findUniqueOrThrow({ where: { id: d.compraId } });
  assert.equal(compra.status, 'AGUARDANDO_RECEBIMENTO');
  // aprovar NAO movimenta estoque nem altera custo
  let prod = await prisma.produto.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(prod.estoqueAtual, 5);
  assert.equal(prod.precoCustoCentavos, 1250);
  assert.equal(await prisma.movimentacaoEstoque.count(), 0);
  assert.equal(d.recebimentoFisicoEm, null);
  assert.equal(d.statusEstoque, 'NAO_APLICADO');

  // dados de custo ja disponiveis, mas marcados como nao atualizados
  const custo = (await get(`/api/nfe/documentos/${docId}/dados-custo`, gerente)).json() as any;
  assert.equal(custo.contrato, 'nfe-pricing-contract/v1');
  assert.equal(custo.estagios.recebimentoFisicoConfirmado, false);
  assert.equal(custo.estagios.estoqueAtualizado, false);
  assert.equal(custo.estagios.custoAtualizadoPorEsteModulo, false);
  assert.equal(custo.itens[0].produtoId, p.id);
  assert.equal(custo.itens[0].valorUnitarioOriginal, '12.5000000000');

  // recebimento integral
  const rec = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { recebimentoIntegral: true });
  assert.equal(rec.statusCode, 200, rec.body);
  prod = await prisma.produto.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(prod.estoqueAtual, 15);
  assert.equal(prod.precoCustoCentavos, 1250, 'custo nao e atualizado por este modulo');
  assert.equal(prod.precoVendaCentavos, 2500, 'preco nao e alterado');
  const movs = await prisma.movimentacaoEstoque.findMany();
  assert.equal(movs.length, 1);
  assert.match(movs[0].documentoRef ?? '', /^NF-e \d{44}$/);
  d = await doc(docId);
  assert.equal(d.statusEstoque, 'APLICADO');
  assert.ok(d.recebimentoFisicoEm && d.estoqueAtualizadoEm);
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: d.compraId } })).status, 'CONFIRMADA');
  // historico registra cada decisao
  const acoes = d.historico.map((h: any) => h.acao);
  for (const a of ['DOCUMENTO_INTERPRETADO', 'COMPRA_APROVADA', 'RECEBIMENTO_FISICO_CONFIRMADO', 'ESTOQUE_ATUALIZADO']) assert.ok(acoes.includes(a), `faltou ${a}`);
  // repetir e idempotente: nao duplica a entrada
  const rec2 = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { recebimentoIntegral: true });
  assert.equal((rec2.json() as any).jaAplicado, true);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 15);
  assert.equal(await prisma.movimentacaoEstoque.count(), 1);
});

test('aprovacao com alertas abertos exige reconhecimento explicito', async () => {
  const { docId } = await cenarioAprovavel({ custo: 500 }); // unit 12,50 vs custo 5,00 => alerta de preco
  const sem = await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, {});
  assert.equal(sem.statusCode, 422);
  assert.match((sem.json() as any).erro, /alertas/i);
  const com = await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { reconheceAlertas: true });
  assert.equal(com.statusCode, 200);
  const rev = await prisma.reviewQueueItem.findFirstOrThrow({ where: { documentoId: docId, motivo: 'DIVERGENCIA_PRECO_CUSTO' } });
  assert.equal(rev.status, 'RESOLVIDO');
  assert.match(rev.resolucao ?? '', /ACEITO_NA_APROVACAO/);
});

test('divergencia de quantidade no recebimento: exige motivo e registra; entra a quantidade REALMENTE recebida', async () => {
  const { p, docId } = await cenarioAprovavel({ custo: 1250, estoque: 0, qtd: '10.0000' });
  await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { reconheceAlertas: true });
  const itemId = (await doc(docId)).itens[0].id;
  const sem = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { itens: [{ itemId, quantidadeRecebida: 8 }] });
  assert.equal(sem.statusCode, 422);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 0);
  const ok = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { itens: [{ itemId, quantidadeRecebida: 8 }], motivoDivergencia: 'duas latas avariadas no transporte' });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 8);
  const rev = await prisma.reviewQueueItem.findFirstOrThrow({ where: { documentoId: docId, motivo: 'DIVERGENCIA_QUANTIDADE_RECEBIMENTO' } });
  assert.equal(rev.status, 'RESOLVIDO');
  assert.match(rev.detalhe ?? '', /NF 10, recebido 8/);
});

test('falha de integracao com estoque: nada e gravado, estado FALHA, pendencia aberta; retentativa aplica uma unica vez', async () => {
  const { p, docId } = await cenarioAprovavel({ custo: 1250, estoque: 3 });
  await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { reconheceAlertas: true });
  estoqueFalha = true;
  const falha = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { recebimentoIntegral: true });
  assert.equal(falha.statusCode, 502);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 3, 'saldo intacto');
  assert.equal(await prisma.movimentacaoEstoque.count(), 0);
  let d = await doc(docId);
  assert.equal(d.statusEstoque, 'FALHA');
  assert.ok(d.recebimentoFisicoEm, 'recebimento fisico continua registrado (etapa separada)');
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FALHA_INTEGRACAO_ESTOQUE' && x.status === 'ABERTO'));
  assert.ok(d.historico.some((h: any) => h.acao === 'ESTOQUE_FALHA' && h.status === 'ERROR'));
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: d.compraId } })).status, 'AGUARDANDO_RECEBIMENTO');

  estoqueFalha = false;
  const retry = await post(`/api/nfe/documentos/${docId}/aplicar-estoque`, gerente);
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 13);
  d = await doc(docId);
  assert.equal(d.statusEstoque, 'APLICADO');
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FALHA_INTEGRACAO_ESTOQUE' && x.status === 'RESOLVIDO'));
  const novamente = await post(`/api/nfe/documentos/${docId}/aplicar-estoque`, gerente);
  assert.equal((novamente.json() as any).jaAplicado, true);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 13);
});

test('estoque so depois de aprovacao E recebimento: tentar receber sem aprovar e recusado', async () => {
  const { p, docId } = await cenarioAprovavel({ estoque: 1 });
  const r = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { recebimentoIntegral: true });
  assert.equal(r.statusCode, 409);
  assert.equal((await post(`/api/nfe/documentos/${docId}/aplicar-estoque`, gerente)).statusCode, 409);
  assert.equal((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual, 1);
  assert.equal((await get(`/api/nfe/documentos/${docId}/dados-custo`, gerente)).statusCode, 409, 'dados de custo so apos aprovacao');
});

test('rejeicao humana: exige motivo, registra e bloqueia aprovacao posterior', async () => {
  const { docId } = await cenarioAprovavel();
  assert.equal((await post(`/api/nfe/documentos/${docId}/rejeitar`, gerente, { motivo: 'abc' })).statusCode, 400);
  const rej = await post(`/api/nfe/documentos/${docId}/rejeitar`, gerente, { motivo: 'mercadoria nao pedida' });
  assert.equal(rej.statusCode, 200, rej.body);
  assert.equal((await doc(docId)).statusConferencia, 'REJEITADA');
  assert.equal((await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { reconheceAlertas: true })).statusCode, 409);
});

test('evento de cancelamento da NF-e bloqueia o recebimento', async () => {
  const { docId } = await cenarioAprovavel({ numero: 7001 });
  const chave = (await doc(docId)).chaveAcesso as string;
  await post(`/api/nfe/documentos/${docId}/aprovar`, gerente, { reconheceAlertas: true });
  const ev = await upload(app, gerente, 'evento.xml', 'text/xml', Buffer.from(montarXmlEventoCancelamento(chave)));
  assert.equal(ev.corpo.resultados[0].acao, 'EVENTO_REGISTRADO');
  const d = await doc(docId);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'EVENTO_FISCAL_CANCELAMENTO' && x.status === 'ABERTO'));
  const rec = await post(`/api/nfe/documentos/${docId}/confirmar-recebimento`, gerente, { recebimentoIntegral: true });
  assert.equal(rec.statusCode, 422);
  assert.equal(await prisma.movimentacaoEstoque.count(), 0);
});

test('reprocessamento idempotente: mesmos IDs, sem novas pendencias nem documentos', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  void f;
  const r = await enviarXml({ numero: 61, itens: [{ codigo: 'X1', quantidade: '1.0000', valorUnitario: '10.0000000000' }] });
  const docId = r.documentoIds[0];
  const antes = await doc(docId);
  const revisoesAntes = await prisma.reviewQueueItem.count();
  const itensIds = antes.itens.map((i: any) => i.id);
  for (let k = 0; k < 3; k++) {
    await post(`/api/nfe/documentos/${docId}/reconciliar`, gerente);
    const rp = (await post(`/api/nfe/arquivos/${r.arquivoId}/reprocessar`, gerente)).json() as any;
    assert.deepEqual(rp.documentoIds, [docId]);
    assert.equal(rp.acao, 'DUPLICADO');
  }
  const depois = await doc(docId);
  assert.deepEqual(depois.itens.map((i: any) => i.id), itensIds);
  assert.equal(await prisma.nfeDocument.count(), 1);
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.equal(await prisma.reviewQueueItem.count(), revisoesAntes);
  assert.equal(depois.revisoes.length, antes.revisoes.length);
});

test('falha de processamento: arquivo preservado e marcado; reprocessar apos correcao recupera (mesmo arquivo, sem duplicar)', async () => {
  const { chave } = montarXmlNfe({ numero: 8001 });
  const texto = linhasDanfe({ chave, numero: 8001, serie: 1, itens: [{ cod: '000012', desc: 'TINTA ACRILICA FOSCO', ncm: '32091010', csosn: '102', cfop: '5102', un: 'UN', qtd: '10,0000', unit: '12,5000', total: '125,00' }], totalProdutos: '125,00', totalNota: '125,00' }).join('\n');
  const quebrado = {
    pdf: { async extrairTexto() { throw new Error('pdfjs: falha simulada'); }, async renderizarPaginas() { return [Buffer.from('img')]; } },
    get ocr(): never { throw new Error('motor de OCR travou (simulado)'); },
    multimodal: null,
  } as any;
  const appRuim = await buildApp({ logger: false, nfe: { deps: { estoque: gatewayDeTeste }, documentos: quebrado } });
  await appRuim.ready();
  const m = multipart([{ nome: 'scan.pdf', mime: 'application/pdf', dados: Buffer.from('%PDF-1.4\n%conteudo qualquer\n') }]);
  const res = await appRuim.inject({ method: 'POST', url: '/api/nfe/upload', headers: { ...m.headers, ...auth(gerente) }, payload: m.payload });
  const r = (res.json() as any).resultados[0];
  assert.equal(r.status, 'FALHA');
  assert.equal(r.erro.codigo, 'FALHA_PROCESSAMENTO');
  const arq = await prisma.documentoArquivo.findUniqueOrThrow({ where: { id: r.arquivoId } });
  assert.ok(arq.caminho, 'original preservado mesmo com falha');
  assert.ok(await prisma.reviewQueueItem.findFirst({ where: { entidadeId: r.arquivoId, motivo: 'FALHA_PROCESSAMENTO', status: 'ABERTO' } }));
  assert.ok(await prisma.processingLog.findFirst({ where: { entidadeId: r.arquivoId, acao: 'FALHA_PROCESSAMENTO', status: 'ERROR' } }));
  assert.equal(await prisma.nfeDocument.count(), 0);
  await appRuim.close();

  // "correcao": dependencias sadias (texto nativo do PDF disponivel) e reprocessamento do MESMO arquivo
  const sadio = { pdf: { async extrairTexto() { return { paginas: [texto], totalPaginas: 1 }; }, async renderizarPaginas() { return []; } }, ocr: null, multimodal: null };
  const appBom = await buildApp({ logger: false, nfe: { deps: { estoque: gatewayDeTeste }, documentos: sadio } });
  await appBom.ready();
  const rp = (await appBom.inject({ method: 'POST', url: `/api/nfe/arquivos/${r.arquivoId}/reprocessar`, headers: auth(gerente) })).json() as any;
  assert.equal(rp.arquivoId, r.arquivoId);
  assert.equal(rp.status, 'INTERPRETADO');
  assert.equal(rp.metodo, 'PDF_TEXTO');
  assert.equal(rp.documentoIds.length, 1);
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.equal((await prisma.reviewQueueItem.findFirstOrThrow({ where: { entidadeId: r.arquivoId, motivo: 'FALHA_PROCESSAMENTO' } })).status, 'RESOLVIDO');
  await appBom.close();
});
