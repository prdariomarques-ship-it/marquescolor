// Utilitarios de teste compartilhados (banco isolado, usuarios, multipart).
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../src/lib/prisma.js';

/** Limpa TUDO que os testes de NF-e tocam, em ordem segura de FK. */
export async function limparBancoNfe() {
  await prisma.processingLog.deleteMany();
  await prisma.reviewQueueItem.deleteMany();
  await prisma.nfeItem.deleteMany();
  await prisma.produtoFornecedorMap.deleteMany();
  await prisma.nfeDocument.deleteMany();
  await prisma.documentoArquivo.deleteMany();
  await prisma.emailMensagem.deleteMany();
  await prisma.pagamentoVenda.deleteMany();
  await prisma.itemVenda.deleteMany();
  await prisma.venda.deleteMany();
  await prisma.itemCompra.deleteMany();
  await prisma.compra.deleteMany();
  await prisma.itemOrcamento.deleteMany();
  await prisma.orcamento.deleteMany();
  await prisma.movimentacaoEstoque.deleteMany();
  await prisma.contaPagar.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.fornecedor.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.marca.deleteMany();
  await prisma.usuario.deleteMany();
}

export async function criarUsuarios() {
  const mk = async (nome: string, login: string, senha: string, papel: string) =>
    prisma.usuario.create({ data: { nome, login, senhaHash: await bcrypt.hash(senha, 4), papel, deveTrocarSenha: false } });
  return { admin: await mk('Admin', 'admin', 'admin-123', 'ADMIN'), gerente: await mk('Gerente', 'gerente', 'ger-123', 'GERENTE'), vendedor: await mk('Vendedor', 'vendedor', 'ven-123', 'VENDEDOR') };
}

export async function login(app: FastifyInstance, login: string, senha: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ login, senha }) });
  return res.json().token;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export function multipart(arquivos: { nome: string; mime: string; dados: Buffer }[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----nfeTest' + Math.random().toString(16).slice(2);
  const partes: Buffer[] = [];
  for (const a of arquivos) {
    partes.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${a.nome}"\r\nContent-Type: ${a.mime}\r\n\r\n`));
    partes.push(a.dados);
    partes.push(Buffer.from('\r\n'));
  }
  partes.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function upload(app: FastifyInstance, token: string, nome: string, mime: string, dados: Buffer) {
  const m = multipart([{ nome, mime, dados }]);
  const res = await app.inject({ method: 'POST', url: '/api/nfe/upload', headers: { ...m.headers, ...auth(token) }, payload: m.payload });
  return { status: res.statusCode, corpo: res.json() as any };
}

export async function criarFornecedor(cnpj: string, razaoSocial = 'Distribuidora Ficticia', formatado = true) {
  const f = formatado ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj;
  return prisma.fornecedor.create({ data: { razaoSocial, cnpj: f } });
}

let seq = 0;
export async function criarProduto(o: { nome?: string; codigoInterno?: string; codigoBarras?: string; custo?: number; estoque?: number; unidade?: string } = {}) {
  seq += 1;
  return prisma.produto.create({
    data: {
      codigoInterno: o.codigoInterno ?? `P${String(seq).padStart(4, '0')}${Date.now() % 100000}`,
      codigoBarras: o.codigoBarras, nome: o.nome ?? `Produto ${seq}`, unidade: o.unidade ?? 'UN',
      precoCustoCentavos: o.custo ?? 0, precoVendaCentavos: (o.custo ?? 0) * 2, estoqueAtual: o.estoque ?? 0,
    },
  });
}
