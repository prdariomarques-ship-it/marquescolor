// Pipeline documental: PDF digital, PDF escaneado, JPG, PNG, multiplas paginas,
// XML prioritario sobre PDF/OCR, motor de OCR ausente. OCR "falso" injetado para a
// logica; o teste de OCR REAL so roda se NFE_OCR_LANG_PATH apontar para os dados
// de idioma locais (caso contrario e reportado como skipped).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { pdfPadrao } from '../src/modules/documentos/pdf.js';
import { criarMotorTesseract, type MotorOcr } from '../src/modules/documentos/ocr.js';
import type { DepsDocumentos } from '../src/modules/documentos/pipeline.js';
import { auth, criarFornecedor, criarProduto, criarUsuarios, limparBancoNfe, login, upload } from './helpers/app-helpers.js';
import { CNPJ_FORNECEDOR, CNPJ_LOJA, montarChave, montarXmlNfe } from './helpers/nfe-fixtures.js';
import { imagemComTexto, linhasDanfe, pdfComTexto, pdfSoImagem } from './helpers/pdf-fixtures.js';

let gerente: string;
let appBase: FastifyInstance;
const apps: FastifyInstance[] = [];

function ocrFalso(textos: string[]): MotorOcr & { chamadas: number } {
  const o = {
    chamadas: 0,
    async reconhecer() { const t = textos[Math.min(o.chamadas, textos.length - 1)]; o.chamadas += 1; return { texto: t, confianca: 91 }; },
  };
  return o;
}

async function appCom(documentos: DepsDocumentos) {
  const a = await buildApp({ logger: false, nfe: { documentos } });
  await a.ready();
  apps.push(a);
  return a;
}
async function enviar(app: FastifyInstance, nome: string, mime: string, dados: Buffer) {
  const r = await upload(app, gerente, nome, mime, dados);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.resultados[0] as any;
}

const itemDanfe = { cod: '000012', desc: 'TINTA ACRILICA FOSCO 18L BRANCO', ncm: '32091010', csosn: '102', cfop: '5102', un: 'UN', qtd: '10,0000', unit: '12,5000', total: '125,00' };

before(async () => {
  process.env.LOJA_CNPJ = CNPJ_LOJA;
  await limparBancoNfe();
  await criarUsuarios();
  appBase = await buildApp({ logger: false });
  await appBase.ready();
  gerente = await login(appBase, 'gerente', 'ger-123');
});
after(async () => {
  for (const a of apps) await a.close();
  await appBase.close();
  await limparBancoNfe();
});
beforeEach(async () => {
  for (const t of ['processingLog', 'reviewQueueItem', 'nfeItem', 'produtoFornecedorMap', 'nfeDocument', 'documentoArquivo', 'emailMensagem'] as const) await (prisma as any)[t].deleteMany();
});

test('PDF digital (texto nativo): extrai pelo texto, SEM OCR, e exige revisao por nao ser XML', async () => {
  const chave = montarChave({ cnpj: CNPJ_FORNECEDOR, numero: 321, serie: 1 });
  const pdf = pdfComTexto([linhasDanfe({ chave, numero: 321, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' })]);
  const ocr = ocrFalso(['nao deve ser chamado']);
  const app = await appCom({ pdf: pdfPadrao, ocr, multimodal: null });
  const r = await enviar(app, 'danfe.pdf', 'application/pdf', pdf);
  assert.equal(r.status, 'INTERPRETADO');
  assert.equal(r.metodo, 'PDF_TEXTO');
  assert.equal(r.tipoDetectado, 'PDF_TEXTO');
  assert.equal(ocr.chamadas, 0, 'OCR nao e usado quando ha texto nativo');
  const d = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${r.documentoIds[0]}`, headers: auth(gerente) })).json() as any;
  assert.equal(d.fonteDados, 'PDF_TEXTO');
  assert.equal(d.chaveAcesso, chave);
  assert.equal(d.chaveValida, true);
  assert.equal(d.numero, '321');
  assert.equal(d.emitenteCnpj, CNPJ_FORNECEDOR);
  assert.equal(d.itens.length, 1);
  assert.equal(d.itens[0].codigoFornecedor, '000012');
  assert.equal(d.itens[0].quantidadeOriginal, '10.0000');
  assert.equal(d.itens[0].valorUnitarioOriginal, '12.5000');
  assert.equal(d.itens[0].valorTotalCentavos, 12500);
  assert.equal(d.itens[0].csosn, '102');
  assert.equal(d.itens[0].origemDados, 'PDF_TEXTO');
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FONTE_NAO_XML' && x.severidade === 'BLOQUEANTE'));
  assert.equal(JSON.parse(d.origemCamposJson).campos.chaveAcesso.startsWith('PDF_TEXTO:'), true, 'origem de cada campo registrada');
});

test('PDF escaneado (so imagem): renderiza paginas e usa OCR; confianca baixa e revisao obrigatoria', async () => {
  const chave = montarChave({ cnpj: CNPJ_FORNECEDOR, numero: 322, serie: 1 });
  const textoOcr = linhasDanfe({ chave, numero: 322, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' }).join('\n');
  const jpeg = imagemComTexto(['pagina escaneada'], 'jpeg', 600, 800);
  const pdf = pdfSoImagem([{ dados: jpeg, largura: 600, altura: 800 }]);
  const ocr = ocrFalso([textoOcr]);
  const app = await appCom({ pdf: pdfPadrao, ocr, multimodal: null });
  const r = await enviar(app, 'scan.pdf', 'application/pdf', pdf);
  assert.equal(r.status, 'INTERPRETADO');
  assert.equal(r.tipoDetectado, 'PDF_ESCANEADO');
  assert.equal(r.metodo, 'OCR');
  assert.equal(ocr.chamadas, 1, 'pagina renderizada foi enviada ao OCR');
  const etapas = Object.fromEntries(r.etapas.map((e: any) => [e.etapa, e.status]));
  assert.equal(etapas.PDF_TEXTO, 'SEM_RESULTADO');
  assert.equal(etapas.PDF_RENDERIZACAO, 'OK');
  assert.equal(etapas.OCR, 'OK');
  assert.equal(etapas.MULTIMODAL, undefined, 'multimodal nem e tentado quando o OCR ja entregou dados');
  const d = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${r.documentoIds[0]}`, headers: auth(gerente) })).json() as any;
  assert.equal(d.fonteDados, 'OCR');
  assert.ok(d.confianca < 0.5);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FONTE_NAO_XML'));
});

test('PDF escaneado de varias paginas: todas as paginas sao renderizadas e reconhecidas', async () => {
  const chave = montarChave({ cnpj: CNPJ_FORNECEDOR, numero: 323, serie: 1 });
  const pag1 = linhasDanfe({ chave, numero: 323, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' }).slice(0, 8).join('\n');
  const pag2 = ['000013 SELADOR ACRILICO 18L 32091010 102 5102 UN 2,0000 30,0000 60,00', 'VALOR TOTAL DOS PRODUTOS 185,00', 'VALOR TOTAL DA NOTA 185,00'].join('\n');
  const j = imagemComTexto(['x'], 'jpeg', 500, 700);
  const pdf = pdfSoImagem([{ dados: j, largura: 500, altura: 700 }, { dados: j, largura: 500, altura: 700 }, { dados: j, largura: 500, altura: 700 }]);
  const ocr = ocrFalso([pag1, pag2, 'pagina 3 sem dados']);
  const app = await appCom({ pdf: pdfPadrao, ocr, multimodal: null });
  const r = await enviar(app, 'scan3.pdf', 'application/pdf', pdf);
  assert.equal(ocr.chamadas, 3);
  assert.equal(r.status, 'INTERPRETADO');
  const d = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${r.documentoIds[0]}`, headers: auth(gerente) })).json() as any;
  assert.equal(d.itens.length, 2, 'itens de paginas diferentes foram reunidos');
  assert.deepEqual(d.itens.map((i: any) => i.codigoFornecedor), ['000012', '000013']);
});

test('imagens JPG e PNG: vao direto ao OCR (sem renderizacao de PDF)', async () => {
  for (const [formato, mime, numero] of [['jpeg', 'image/jpeg', 324], ['png', 'image/png', 325]] as const) {
    const chave = montarChave({ cnpj: CNPJ_FORNECEDOR, numero, serie: 1 });
    const ocr = ocrFalso([linhasDanfe({ chave, numero, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' }).join('\n')]);
    const app = await appCom({ pdf: pdfPadrao, ocr, multimodal: null });
    const r = await enviar(app, `foto.${formato === 'jpeg' ? 'jpg' : 'png'}`, mime, imagemComTexto(['foto da nota'], formato, 800, 1000));
    assert.equal(r.tipoDetectado, 'IMAGEM');
    assert.equal(r.metodo, 'OCR');
    assert.equal(r.status, 'INTERPRETADO');
    assert.equal(r.etapas.find((e: any) => e.etapa === 'PDF_RENDERIZACAO').status, 'PULADA');
    assert.equal(ocr.chamadas, 1);
  }
});

test('tipo e decidido pela assinatura, nao pela extensao: PNG renomeado .xml segue o caminho de imagem', async () => {
  const ocr = ocrFalso(['texto sem dados fiscais']);
  const app = await appCom({ pdf: pdfPadrao, ocr, multimodal: null });
  const r = await enviar(app, 'engana.xml', 'text/xml', imagemComTexto(['x'], 'png', 400, 400));
  assert.equal(r.tipoDetectado, 'IMAGEM');
  assert.equal(ocr.chamadas, 1);
});

test('OCR nao configurado: documento escaneado vira SEM_DADOS com causa registrada, original preservado, sem excecao', async () => {
  const j = imagemComTexto(['x'], 'jpeg', 500, 700);
  const app = await appCom({ pdf: pdfPadrao, ocr: null, multimodal: null });
  const r = await enviar(app, 'scan.pdf', 'application/pdf', pdfSoImagem([{ dados: j, largura: 500, altura: 700 }]));
  assert.equal(r.status, 'SEM_DADOS');
  const ocrEtapa = r.etapas.find((e: any) => e.etapa === 'OCR');
  assert.equal(ocrEtapa.status, 'FALHA');
  assert.match(ocrEtapa.detalhe, /nao configurado/);
  assert.equal(await prisma.nfeDocument.count(), 0);
  assert.ok(await prisma.reviewQueueItem.findFirst({ where: { entidadeId: r.arquivoId, motivo: 'ARQUIVO_SEM_DADOS', status: 'ABERTO' } }));
  const status = (await app.inject({ method: 'GET', url: '/api/nfe/ocr/status', headers: auth(gerente) })).json() as any;
  assert.equal(typeof status.configurado, 'boolean');
});

test('OCR com idioma ausente falha de forma explicita e SEM tentar baixar nada da rede', async () => {
  const motor = criarMotorTesseract({ langPath: path.join(process.cwd(), 'nao-existe-ocr-data'), lang: 'por' });
  await assert.rejects(() => motor.reconhecer(imagemComTexto(['x'], 'png', 200, 200)), /dados de idioma ausentes/);
});

test('XML prevalece sobre PDF/OCR: XML recebido depois substitui a leitura aproximada da mesma nota', async () => {
  const f = await criarFornecedor(CNPJ_FORNECEDOR);
  const p = await criarProduto({ nome: 'Tinta' });
  await prisma.produtoFornecedorMap.create({ data: { fornecedorId: f.id, codigoFornecedor: '000012', produtoId: p.id } });
  const { xml, chave } = montarXmlNfe({ numero: 326, itens: [{ codigo: '000012', descricao: 'TINTA ACRILICA FOSCO 18L BRANCO', ncm: '32091010', quantidade: '10.0000', valorUnitario: '12.5000000000', csosn: '102' }] });
  const pdf = pdfComTexto([linhasDanfe({ chave, numero: 326, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' })]);
  const app = await appCom({ pdf: pdfPadrao, ocr: null, multimodal: null });
  const a = await enviar(app, 'danfe.pdf', 'application/pdf', pdf);
  const docId = a.documentoIds[0];
  const antes = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${docId}`, headers: auth(gerente) })).json() as any;
  assert.equal(antes.fonteDados, 'PDF_TEXTO');
  assert.ok(antes.revisoes.some((x: any) => x.motivo === 'FONTE_NAO_XML' && x.status === 'ABERTO'));
  const b = await enviar(app, 'nota.xml', 'text/xml', Buffer.from(xml));
  assert.equal(b.acao, 'PROMOVIDO_PARA_XML');
  assert.deepEqual(b.documentoIds, [docId], 'mesmo documento, sem duplicar');
  const depois = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${docId}`, headers: auth(gerente) })).json() as any;
  assert.equal(depois.fonteDados, 'XML');
  assert.equal(depois.itens[0].origemDados, 'XML');
  assert.equal(depois.itens[0].gtin, null);
  assert.ok(!depois.revisoes.some((x: any) => x.motivo === 'FONTE_NAO_XML' && x.status === 'ABERTO'), 'pendencia de fonte fechada');
  assert.equal(depois.itens[0].statusVinculo, 'MAPEADO');
  assert.equal(await prisma.nfeDocument.count(), 1);
  // o XML nao e rebaixado por um PDF posterior
  const c = await enviar(app, 'danfe2.pdf', 'application/pdf', pdfComTexto([linhasDanfe({ chave, numero: 326, serie: 1, itens: [{ ...itemDanfe, desc: 'OUTRA DESCRICAO' }], totalProdutos: '125,00', totalNota: '125,00' })]));
  assert.equal(c.acao, 'IGNORADO_FONTE_INFERIOR');
  assert.equal(((await app.inject({ method: 'GET', url: `/api/nfe/documentos/${docId}`, headers: auth(gerente) })).json() as any).fonteDados, 'XML');
});

test('PDF com chave de DV invalido lida pelo texto: pendencia bloqueante de chave', async () => {
  const chaveRuim = montarChave({ cnpj: CNPJ_FORNECEDOR, numero: 327, serie: 1, dvErrado: true });
  const pdf = pdfComTexto([linhasDanfe({ chave: chaveRuim, numero: 327, serie: 1, itens: [itemDanfe], totalProdutos: '125,00', totalNota: '125,00' })]);
  const app = await appCom({ pdf: pdfPadrao, ocr: null, multimodal: null });
  const r = await enviar(app, 'ruim.pdf', 'application/pdf', pdf);
  const d = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${r.documentoIds[0]}`, headers: auth(gerente) })).json() as any;
  assert.equal(d.chaveValida, false);
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'CHAVE_INVALIDA'));
});

test('multimodal desligado por padrao; quando ligado, a saida e SUGESTAO marcada e exige revisao', async () => {
  const j = imagemComTexto(['x'], 'jpeg', 500, 700);
  const pdf = pdfSoImagem([{ dados: j, largura: 500, altura: 700 }]);
  const chave = montarChave({ cnpj: CNPJ_FORNECEDOR, numero: 328, serie: 1 });
  const sugestao = {
    async interpretar() {
      return {
        chaveAcesso: chave, cUF: '35', modelo: '55', serie: '1', numero: '328', naturezaOperacao: null, dataEmissao: null,
        emitente: { cnpj: CNPJ_FORNECEDOR, cpf: null, nome: 'X', fantasia: null, ie: null, crt: null, uf: null }, destinatario: { cnpj: CNPJ_LOJA, cpf: null, nome: null },
        totais: { produtosCentavos: 1000, freteCentavos: null, seguroCentavos: null, descontoCentavos: null, outrasCentavos: null, icmsCentavos: null, icmsStCentavos: null, ipiCentavos: null, pisCentavos: null, cofinsCentavos: null, notaCentavos: 1000 },
        pagamentos: [], duplicatas: [], protocolo: null, fonte: 'XML' as const, origemCampos: {}, avisos: [],
        itens: [{ numeroItem: 1, codigoFornecedor: 'A', gtin: null, descricao: 'ITEM', ncm: null, cest: null, cfop: null, origemMercadoria: null, cst: null, csosn: null, unidade: 'UN', unidadeTributavel: null, quantidadeOriginal: '1.0000', valorUnitarioOriginal: '10.0000', valorTotalCentavos: 1000, freteCentavos: 0, seguroCentavos: 0, descontoCentavos: 0, outrasCentavos: 0, icmsCentavos: 0, icmsStCentavos: 0, ipiCentavos: 0, pisCentavos: 0, cofinsCentavos: 0, impostosOriginais: null, origemDados: 'MULTIMODAL' as const }],
      };
    },
  };
  const app = await appCom({ pdf: pdfPadrao, ocr: ocrFalso(['']), multimodal: sugestao });
  const r = await enviar(app, 'foto.pdf', 'application/pdf', pdf);
  assert.equal(r.metodo, 'MULTIMODAL');
  const d = (await app.inject({ method: 'GET', url: `/api/nfe/documentos/${r.documentoIds[0]}`, headers: auth(gerente) })).json() as any;
  assert.equal(d.fonteDados, 'MULTIMODAL', 'a fonte nunca e promovida a XML');
  assert.ok(d.revisoes.some((x: any) => x.motivo === 'FONTE_NAO_XML'));
  assert.ok(d.confianca < 0.7);
});

// ------------------------------------------------------------------ OCR REAL (opcional, offline)
const langPath = process.env.NFE_OCR_LANG_PATH ? path.resolve(process.env.NFE_OCR_LANG_PATH) : null;
const idioma = process.env.NFE_OCR_LANG || 'por';
const temIdioma = !!langPath && existsSync(path.join(langPath, `${idioma}.traineddata`));

test('OCR REAL (tesseract.js offline) sobre imagem e PDF escaneado sinteticos', { skip: temIdioma ? false : 'defina NFE_OCR_LANG_PATH com o idioma local (ver docs) — nenhum download automatico' }, async () => {
  const motor = criarMotorTesseract({ langPath: langPath!, lang: idioma });
  try {
    const linhas = ['DANFE NOTA FISCAL', 'EMISSAO 20/10/2026', 'VALOR TOTAL DA NOTA 125,00', 'CNPJ 11.222.333/0001-81'];
    const img = imagemComTexto(linhas, 'png', 1240, 500);
    const direto = await motor.reconhecer(img);
    assert.match(direto.texto.toUpperCase(), /VALOR TOTAL DA NOTA/);
    assert.match(direto.texto, /125,00/);
    // Observado na execucao real: o OCR pode errar digitos (ex.: CNPJ 11.222.888/0001-8). Por isso OCR
    // NUNCA e fonte confiavel: CNPJ/chave passam por validacao de DV e tudo vai para revisao humana.
    assert.match(direto.texto, /11\.222\.\d{3}\/0001/);

    const jpeg = imagemComTexto(linhas, 'jpeg', 1240, 500);
    const app = await appCom({ pdf: pdfPadrao, ocr: motor, multimodal: null });
    const r = await enviar(app, 'real.pdf', 'application/pdf', pdfSoImagem([{ dados: jpeg, largura: 1240, altura: 500 }]));
    const ocrEtapa = r.etapas.find((e: any) => e.etapa === 'OCR');
    assert.equal(ocrEtapa.status, 'OK', JSON.stringify(r.etapas));
    assert.equal(r.etapas.find((e: any) => e.etapa === 'PDF_RENDERIZACAO').status, 'OK');
  } finally {
    await motor.encerrar?.();
  }
});
