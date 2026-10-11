import { prisma } from '../../lib/prisma.js';
import { signAccessToken, signRefreshToken, refreshExpiraEmMs } from '../../lib/jwt.js';
import { compararSenha, hashSenha } from '../../lib/senha.js';
import {
  chaveRateLimit,
  incrementarTentativa,
  resetarTentativas,
  minutosRestantes,
} from '../../lib/rateLimitLogin.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import type { FastifyInstance } from 'fastify';

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    nome: string;
    login: string;
    papel: string;
    deveTrocarSenha: boolean;
  };
  deveTrocarSenha: boolean;
}

export async function login(
  app: FastifyInstance,
  loginInput: string,
  senha: string,
  ip: string | undefined,
): Promise<{ status: number; body: any }> {
  const chave = chaveRateLimit(ip, loginInput);

  // Verifica rate limit ANTES de consultar o banco
  const rl = incrementarTentativa(chave);
  if (rl.excedeu) {
    const min = minutosRestantes(chave);
    return {
      status: 429,
      body: { erro: `Muitas tentativas. Aguarde ${min} minutos.` },
    };
  }

  // Busca usuario por login (case-insensitive em SQLite via lower)
  const usuario = await prisma.usuario.findFirst({
    where: { login: { equals: loginInput } },
  });

  if (!usuario) {
    return { status: 401, body: { erro: 'Credenciais invalidas' } };
  }

  if (!usuario.ativo) {
    return { status: 403, body: { erro: 'Usuario bloqueado' } };
  }

  const senhaOk = await compararSenha(senha, usuario.senhaHash);
  if (!senhaOk) {
    return { status: 401, body: { erro: 'Credenciais invalidas' } };
  }

  // Sucesso: resetar tentativas, atualizar ultimoLogin, gerar tokens
  resetarTentativas(chave);

  const token = signAccessToken(app, { sub: usuario.id });
  const refreshTokenStr = signRefreshToken();
  await prisma.refreshToken.create({
    data: {
      usuarioId: usuario.id,
      token: refreshTokenStr,
      expiraEm: new Date(Date.now() + refreshExpiraEmMs()),
    },
  });

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date() },
  });

  await registrarAuditoria(prisma, {
    usuarioId: usuario.id,
    acao: 'LOGIN',
    entidade: 'Usuario',
    entidadeId: usuario.id,
    ip,
  });

  const result: LoginResult = {
    token,
    refreshToken: refreshTokenStr,
    user: {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      papel: usuario.papel,
      deveTrocarSenha: usuario.deveTrocarSenha,
    },
    deveTrocarSenha: usuario.deveTrocarSenha,
  };

  return { status: 200, body: result };
}

export async function refresh(
  app: FastifyInstance,
  refreshTokenStr: string,
): Promise<{ status: number; body: any }> {
  const rt = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenStr },
    include: { usuario: true },
  });

  if (!rt) {
    return { status: 401, body: { erro: 'Refresh token invalido' } };
  }

  if (rt.revogado) {
    return { status: 401, body: { erro: 'Refresh token revogado' } };
  }

  if (rt.expiraEm < new Date()) {
    return { status: 401, body: { erro: 'Refresh token expirado' } };
  }

  if (!rt.usuario.ativo) {
    return { status: 401, body: { erro: 'Usuario inativo' } };
  }

  // Rotacao: revoga o antigo
  await prisma.refreshToken.update({
    where: { id: rt.id },
    data: { revogado: true },
  });

  // Gera novo par
  const token = signAccessToken(app, { sub: rt.usuario.id });
  const novoRefresh = signRefreshToken();
  await prisma.refreshToken.create({
    data: {
      usuarioId: rt.usuario.id,
      token: novoRefresh,
      expiraEm: new Date(Date.now() + refreshExpiraEmMs()),
    },
  });

  return {
    status: 200,
    body: { token, refreshToken: novoRefresh },
  };
}

export async function trocarSenha(
  usuarioId: string,
  senhaAtual: string,
  novaSenha: string,
): Promise<{ status: number; body: any }> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) {
    return { status: 404, body: { erro: 'Usuario nao encontrado' } };
  }

  const ok = await compararSenha(senhaAtual, usuario.senhaHash);
  if (!ok) {
    return { status: 400, body: { erro: 'Senha atual incorreta' } };
  }

  const novoHash = await hashSenha(novaSenha);

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        senhaHash: novoHash,
        deveTrocarSenha: false,
      },
    }),
    // Revoga TODOS os refresh tokens do usuario
    prisma.refreshToken.updateMany({
      where: { usuarioId, revogado: false },
      data: { revogado: true },
    }),
  ]);

  await registrarAuditoria(prisma, {
    usuarioId,
    acao: 'TROCA_SENHA',
    entidade: 'Usuario',
    entidadeId: usuarioId,
  });

  return { status: 200, body: { ok: true } };
}

export async function logout(
  usuarioId: string,
  refreshTokenStr: string,
): Promise<{ status: number; body: any }> {
  const rt = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenStr },
  });

  if (rt && rt.usuarioId === usuarioId) {
    await prisma.refreshToken.update({
      where: { id: rt.id },
      data: { revogado: true },
    });
  }

  await registrarAuditoria(prisma, {
    usuarioId,
    acao: 'LOGOUT',
    entidade: 'Usuario',
    entidadeId: usuarioId,
  });

  return { status: 200, body: { ok: true } };
}

export async function me(usuarioId: string): Promise<{ status: number; body: any }> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      nome: true,
      login: true,
      papel: true,
      ativo: true,
      deveTrocarSenha: true,
      ultimoLogin: true,
      criadoEm: true,
    },
  });

  if (!usuario) {
    return { status: 404, body: { erro: 'Usuario nao encontrado' } };
  }

  return { status: 200, body: usuario };
}
