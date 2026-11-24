// Recebimento por e-mail: parsing RFC 822, anexos, duplicidade, classificacao,
// indisponibilidade/retentativas. NENHUM teste toca caixa real: fontes simuladas e
// .eml sinteticos. A integracao IMAP/Outlook real NAO foi testada (ver docs).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { parseEml } from '../src/modules/email/eml.js';
import { configImapDoAmbiente } from '../src/modules/email/imap.js';
import { ingerirEmail, sincronizarCaixa } from '../src/modules/email/ingestao-email.js';
import type { EmailBruto, EmailSource } from '../src/modules/email/tipos.js';
import { depsDocumentosPadrao } from '../src/modules/documentos/pipeline.js';
import { novoContexto } from '../src/modules/nfe/log.js';
import { auth, criarUsuarios, limparBancoNfe, login } from './helpers/app-helpers.js';
import { CNPJ_LOJA, montarXmlNfe } from './helpers/nfe-fixtures.js';

const deps = () => depsDocumentosPadrao();

function eml(o: { messageId?: string | null; assunto?: string; corpo?: string; de?: string; anexos?: { nome: string; mime: string; dados: Buffer }[] }): Buffer {
  const b = 'bndry' + Math.random().toString(16).slice(2);
  const cab = [
    `From: Fornecedor Ficticio <${o.de ?? 'vendas@fornecedor.example'}>`,
    'To: loja@marquescolor.example',
    `Subject: ${o.assunto ?? 'Nota fiscal eletronica'}`,
    'Date: Tue, 20 Oct 2026 10:00:00 -0300',
    ...(o.messageId === null ? [] : [`Message-ID: ${o.messageId ?? '<msg-1@fornecedor.example>'}`]),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
  ].join('\r\n');
  const partes = [`--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${o.corpo ?? 'Segue a nota fiscal em anexo.'}\r\n`];
  for (const a of o.anexos ?? []) {
    partes.push(`--${b}\r\nContent-Type: ${a.mime}; name="${a.nome}"\r\nContent-Disposition: attachment; filename="${a.nome}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${a.dados.toString('base64').replace(/(.{76})/g, '$1\r\n')}\r\n`);
  }
  return Buffer.from(`${cab}\r\n\r\n${partes.join('')}--${b}--\r\n`);
}

const xmlAnexo = (numero: number) => ({ nome: `nfe-${numero}.xml`, mime: 'application/xml', dados: Buffer.from(montarXmlNfe({ numero }).xml) });
const bruto = async (o: Parameters<typeof eml>[0]) => parseEml(eml(o));

let app: FastifyInstance;
let admin: string;
let gerente: string;

before(async () => {
  process.env.LOJA_CNPJ = CNPJ_LOJA;
  await limparBancoNfe();
  await criarUsuarios();
  app = await buildApp({ logger: false });
  await app.ready();
  admin = await login(app, 'admin', 'admin-123');
  gerente = await login(app, 'gerente', 'ger-123');
});
after(async () => { await app.close(); await limparBancoNfe(); });
beforeEach(async () => {
  for (const t of ['processingLog', 'reviewQueueItem', 'nfeItem', 'produtoFornecedorMap', 'nfeDocument', 'documentoArquivo', 'emailMensagem'] as const) await (prisma as any)[t].deleteMany();
});

test('parse de .eml: remetente, assunto, Message-ID e anexo XML com bytes identicos', async () => {
  const x = xmlAnexo(1);
  const r = await parseEml(eml({ anexos: [x] }));
  assert.equal(r.messageId, '<msg-1@fornecedor.example>');
  assert.equal(r.remetente, 'vendas@fornecedor.example');
  assert.equal(r.assunto, 'Nota fiscal eletronica');
  assert.equal(r.anexos.length, 1);
  assert.ok(r.anexos[0].conteudo.equals(x.dados));
});

test('Message-ID ausente: usa SHA-256 dos bytes (deterministico), nunca valor aleatorio', async () => {
  const bytes = eml({ messageId: null });
  const a = await parseEml(bytes);
  const b = await parseEml(bytes);
  assert.match(a.messageId, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.messageId, b.messageId);
});

test('e-mail com NF-e XML: cria mensagem, anexo e documento; classifica NF_E', async () => {
  const raw = await bruto({ anexos: [xmlAnexo(100)] });
  const r = await ingerirEmail(novoContexto(), deps(), raw, 'caixa-teste');
  assert.equal(r.duplicado, false);
  assert.equal(r.categoria, 'NF_E');
  assert.equal(r.status, 'PROCESSADO');
  assert.equal(r.documentoIds.length, 1);
  const m = await prisma.emailMensagem.findUniqueOrThrow({ where: { id: r.emailId }, include: { arquivos: true, documentos: true } });
  assert.equal(m.conta, 'caixa-teste');
  assert.equal(m.arquivos.length, 1);
  assert.equal(m.documentos[0].id, r.documentoIds[0]);
});

test('duplicidade por Message-ID e por anexo (mesmo SHA-256 em outro e-mail)', async () => {
  const a = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<a@x>', anexos: [xmlAnexo(200)] }));
  const dupMsg = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<a@x>', anexos: [xmlAnexo(200)] }));
  assert.equal(dupMsg.duplicado, true);
  assert.equal(dupMsg.emailId, a.emailId);
  // outro e-mail, mesmo XML
  const outro = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<b@x>', anexos: [xmlAnexo(200)] }));
  assert.equal(outro.duplicado, false);
  assert.equal(outro.arquivos[0].duplicado, true);
  assert.deepEqual(outro.documentoIds, a.documentoIds);
  assert.equal(await prisma.nfeDocument.count(), 1);
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.equal(await prisma.emailMensagem.count(), 2);
});

test('e-mail sem anexo e sem palavras-chave vai para revisao humana; spam e financeiro sao apenas classificados', async () => {
  const d = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<d@x>', assunto: 'Ola', corpo: 'Tudo bem?', anexos: [] }));
  assert.equal(d.categoria, 'DESCONHECIDO');
  assert.equal(d.status, 'REVISAO_HUMANA');
  assert.ok(await prisma.reviewQueueItem.findFirst({ where: { entidadeTipo: 'EMAIL', entidadeId: d.emailId, motivo: 'EMAIL_NAO_CLASSIFICADO' } }));
  const s = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<s@x>', assunto: 'Promocao imperdivel', corpo: 'compre agora, clique para descadastrar' }));
  assert.equal(s.categoria, 'SPAM');
  const f = await ingerirEmail(novoContexto(), deps(), await bruto({ messageId: '<f@x>', assunto: 'Boleto com vencimento amanha', corpo: 'segue o boleto' }));
  assert.equal(f.categoria, 'FINANCEIRO');
  assert.equal(f.status, 'PROCESSADO');
  assert.equal(await prisma.nfeDocument.count(), 0);
});

test('anexos de tipo nao suportado sao ignorados com registro (nao poluem a fila)', async () => {
  const r = await ingerirEmail(novoContexto(), deps(), await bruto({ anexos: [{ nome: 'assinatura.p7s', mime: 'application/pkcs7-signature', dados: Buffer.from([0x30, 0x82, 0x01, 0x02]) }, xmlAnexo(300)] }));
  assert.equal(r.documentoIds.length, 1);
  assert.equal(r.arquivos.find((a) => a.nome === 'assinatura.p7s')?.ignorado, 'tipo nao suportado');
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.ok(await prisma.processingLog.findFirst({ where: { acao: 'ANEXO_IGNORADO' } }));
});

test('XML invalido anexado: e-mail fica em ERRO, anexo preservado, fila de revisao, historico', async () => {
  const r = await ingerirEmail(novoContexto(), deps(), await bruto({ anexos: [{ nome: 'quebrado.xml', mime: 'application/xml', dados: Buffer.from('<nfeProc><NFe>') }] }));
  assert.equal(r.status, 'ERRO');
  assert.equal(await prisma.nfeDocument.count(), 0);
  assert.equal(await prisma.documentoArquivo.count(), 1);
  assert.ok(await prisma.reviewQueueItem.findFirst({ where: { motivo: 'ARQUIVO_SEM_DADOS' } }));
});

// ------------------------------------------------------------------ sincronizacao

function fonte(o: { falhasBusca?: number; emails?: EmailBruto[]; marcarFalha?: boolean }): EmailSource & { buscas: number; marcados: string[] } {
  let falhas = o.falhasBusca ?? 0;
  const f = {
    rotulo: 'fonte-simulada', buscas: 0, marcados: [] as string[],
    async buscarNaoProcessados() { f.buscas += 1; if (falhas > 0) { falhas -= 1; throw new Error('ECONNRESET simulado'); } return o.emails ?? []; },
    async marcarProcessado(e: EmailBruto) { if (o.marcarFalha) throw new Error('falha ao marcar'); f.marcados.push(e.messageId); },
  };
  return f;
}
const semEspera = { dormir: async () => undefined, tentativas: 3, baseMs: 1 };

test('caixa indisponivel: retentativas com espera crescente, falha limpa e nada processado', async () => {
  const esperas: number[] = [];
  const f = fonte({ falhasBusca: 99 });
  const r = await sincronizarCaixa(novoContexto(), deps(), f, { tentativas: 3, baseMs: 100, dormir: async (ms) => { esperas.push(ms); } });
  assert.equal(r.ok, false);
  assert.equal(f.buscas, 3);
  assert.deepEqual(esperas, [100, 200]);
  assert.equal(await prisma.emailMensagem.count(), 0);
  assert.ok(await prisma.processingLog.findFirst({ where: { acao: 'SINCRONIZACAO_FALHOU', status: 'ERROR' } }));
});

test('indisponibilidade transitoria: a retentativa funciona e os e-mails sao processados e marcados', async () => {
  const f = fonte({ falhasBusca: 2, emails: [await bruto({ messageId: '<t1@x>', anexos: [xmlAnexo(400)] }), await bruto({ messageId: '<t2@x>', assunto: 'Ola', corpo: 'oi' })] });
  const r = await sincronizarCaixa(novoContexto(), deps(), f, semEspera);
  assert.equal(r.ok, true);
  assert.equal(r.processados, 2);
  assert.deepEqual(f.marcados.sort(), ['<t1@x>', '<t2@x>']);
  // segunda sincronizacao com os mesmos e-mails ainda nao lidos: tudo duplicado, nada novo
  const r2 = await sincronizarCaixa(novoContexto(), deps(), fonte({ emails: [await bruto({ messageId: '<t1@x>', anexos: [xmlAnexo(400)] })] }), semEspera);
  assert.equal(r2.duplicados, 1);
  assert.equal(await prisma.nfeDocument.count(), 1);
});

test('falha ao marcar como processado nao perde dados; falha de um e-mail nao derruba os demais e ele nao e marcado', async () => {
  const ruim = await bruto({ messageId: '<ruim@x>', anexos: [xmlAnexo(500)] });
  const original = prisma.emailMensagem.create.bind(prisma.emailMensagem);
  let quebrou = false;
  (prisma.emailMensagem as any).create = (args: any) => {
    if (!quebrou && args?.data?.messageId === '<ruim@x>') { quebrou = true; return Promise.reject(new Error('disco cheio simulado')); }
    return original(args);
  };
  try {
    const f = fonte({ emails: [ruim, await bruto({ messageId: '<bom@x>', anexos: [xmlAnexo(501)] })] });
    const r = await sincronizarCaixa(novoContexto(), deps(), f, semEspera);
    assert.equal(r.falhas, 1);
    assert.equal(r.processados, 1);
    assert.deepEqual(f.marcados, ['<bom@x>'], 'o e-mail que falhou continua nao lido para a proxima sincronizacao');
    assert.equal(await prisma.nfeDocument.count(), 1);
  } finally {
    (prisma.emailMensagem as any).create = original;
  }
  const f2 = fonte({ emails: [await bruto({ messageId: '<x@x>', anexos: [xmlAnexo(502)] })], marcarFalha: true });
  const r2 = await sincronizarCaixa(novoContexto(), deps(), f2, semEspera);
  assert.equal(r2.processados, 1);
  assert.ok(await prisma.processingLog.findFirst({ where: { acao: 'MARCAR_PROCESSADO_FALHOU' } }));
  assert.equal(await prisma.nfeDocument.count(), 2);
});

test('configuracao por ambiente: nunca inventa credenciais; lista o que falta; OAuth2 exige token', () => {
  const vazio = configImapDoAmbiente({} as NodeJS.ProcessEnv);
  assert.equal(vazio.ok, false);
  assert.deepEqual(vazio.ok ? [] : vazio.faltando, ['EMAIL_IMAP_HOST', 'EMAIL_IMAP_USER', 'EMAIL_IMAP_PASSWORD']);
  const oauthSemToken = configImapDoAmbiente({ EMAIL_IMAP_HOST: 'imap.exemplo.invalid', EMAIL_IMAP_USER: 'u@exemplo.invalid', EMAIL_IMAP_AUTH: 'oauth2' } as unknown as NodeJS.ProcessEnv);
  assert.equal(oauthSemToken.ok, false);
  assert.deepEqual(oauthSemToken.ok ? [] : oauthSemToken.faltando, ['EMAIL_OAUTH_ACCESS_TOKEN']);
  const ok = configImapDoAmbiente({ EMAIL_IMAP_HOST: 'imap.exemplo.invalid', EMAIL_IMAP_USER: 'u@exemplo.invalid', EMAIL_IMAP_PASSWORD: 'segredo-de-teste' } as unknown as NodeJS.ProcessEnv);
  assert.equal(ok.ok, true);
});

test('endpoints de e-mail: sem configuracao responde 503; com fonte simulada sincroniza; so ADMIN sincroniza', async () => {
  const semConfig = await app.inject({ method: 'POST', url: '/api/nfe/email/sincronizar', headers: auth(admin) });
  assert.equal(semConfig.statusCode, 503);
  const st = (await app.inject({ method: 'GET', url: '/api/nfe/email/status', headers: auth(gerente) })).json() as any;
  assert.equal(st.configurado, false);
  assert.ok(Array.isArray(st.faltando));

  const f = fonte({ emails: [await bruto({ messageId: '<api@x>', anexos: [xmlAnexo(600)] })] });
  const app2 = await buildApp({ logger: false, nfe: { fonteEmail: () => f } });
  await app2.ready();
  try {
    assert.equal((await app2.inject({ method: 'POST', url: '/api/nfe/email/sincronizar', headers: auth(gerente) })).statusCode, 403);
    const ok = await app2.inject({ method: 'POST', url: '/api/nfe/email/sincronizar', headers: auth(admin) });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((ok.json() as any).processados, 1);
    const lista = (await app2.inject({ method: 'GET', url: '/api/nfe/emails', headers: auth(gerente) })).json() as any;
    assert.equal(lista.data.length, 1);
    assert.equal(lista.data[0].categoria, 'NF_E');
  } finally {
    await app2.close();
  }
});
