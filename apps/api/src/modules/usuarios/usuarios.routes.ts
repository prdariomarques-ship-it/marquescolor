import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { hashSenha } from '../../lib/senha.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import {
  criarUsuarioSchema,
  atualizarUsuarioSchema,
  redefinirSenhaSchema,
} from '../auth/auth.schemas.js';

export const usuariosRoutes: FastifyPluginAsync = async (app) => {
  // Listar — ADMIN e GERENTE
  app.get('/usuarios', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        login: true,
        papel: true,
        ativo: true,
        deveTrocarSenha: true,
        ultimoLogin: true,
        criadoEm: true,
        atualizadoEm: true,
      },
      orderBy: { nome: 'asc' },
    });
    return reply.send(usuarios);
  });

  // Buscar por id — ADMIN e GERENTE
  app.get('/usuarios/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'GERENTE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true, nome: true, login: true, papel: true,
        ativo: true, deveTrocarSenha: true, ultimoLogin: true, criadoEm: true,
      },
    });
    if (!usuario) return reply.code(404).send({ erro: 'Usuario nao encontrado' });
    return reply.send(usuario);
  });

  // Criar — ADMIN
  app.post('/usuarios', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const parsed = criarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Dados invalidos' });
    }
    const { nome, login, senha, papel, ativo } = parsed.data;

    const existente = await prisma.usuario.findUnique({ where: { login } });
    if (existente) {
      return reply.code(409).send({ erro: 'Login ja existe' });
    }

    const senhaHash = await hashSenha(senha);
    const novo = await prisma.usuario.create({
      data: {
        nome, login, senhaHash, papel, ativo,
        deveTrocarSenha: true, // forca troca no primeiro login
      },
      select: {
        id: true, nome: true, login: true, papel: true,
        ativo: true, deveTrocarSenha: true, criadoEm: true,
      },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: 'USUARIO_CRIADO',
      entidade: 'Usuario',
      entidadeId: novo.id,
      dadosDepois: novo,
      ip: req.ip,
    });

    return reply.code(201).send(novo);
  });

  // Editar — ADMIN
  app.put('/usuarios/:id', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atualizarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Dados invalidos' });
    }

    const antes = await prisma.usuario.findUnique({ where: { id } });
    if (!antes) return reply.code(404).send({ erro: 'Usuario nao encontrado' });

    const atualizado = await prisma.usuario.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true, nome: true, login: true, papel: true,
        ativo: true, deveTrocarSenha: true, atualizadoEm: true,
      },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: 'USUARIO_EDITADO',
      entidade: 'Usuario',
      entidadeId: id,
      dadosAntes: {
        nome: antes.nome, papel: antes.papel, ativo: antes.ativo,
      },
      dadosDepois: {
        nome: atualizado.nome, papel: atualizado.papel, ativo: atualizado.ativo,
      },
      ip: req.ip,
    });

    return reply.send(atualizado);
  });

  // Soft delete (bloquear) — ADMIN
  app.delete('/usuarios/:id', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // ADMIN nao pode desativar a si mesmo
    if (req.usuario!.id === id) {
      return reply.code(400).send({ erro: 'Voce nao pode desativar a si mesmo' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return reply.code(404).send({ erro: 'Usuario nao encontrado' });

    await prisma.usuario.update({
      where: { id },
      data: { ativo: false },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: 'USUARIO_DESATIVADO',
      entidade: 'Usuario',
      entidadeId: id,
      ip: req.ip,
    });

    return reply.send({ ok: true });
  });

  // Redefinir senha — ADMIN
  app.post('/usuarios/:id/redefinir-senha', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = redefinirSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Dados invalidos' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return reply.code(404).send({ erro: 'Usuario nao encontrado' });

    const novoHash = await hashSenha(parsed.data.novaSenha);

    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: { senhaHash: novoHash, deveTrocarSenha: true },
      }),
      // Revoga TODOS os refresh tokens
      prisma.refreshToken.updateMany({
        where: { usuarioId: id, revogado: false },
        data: { revogado: true },
      }),
    ]);

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: 'SENHA_REDEFINIDA',
      entidade: 'Usuario',
      entidadeId: id,
      ip: req.ip,
    });

    return reply.send({ ok: true });
  });

  // Bloquear/desbloquear (toggle ativo) — ADMIN
  app.post('/usuarios/:id/bloquear', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    if (req.usuario!.id === id) {
      return reply.code(400).send({ erro: 'Voce nao pode bloquear a si mesmo' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return reply.code(404).send({ erro: 'Usuario nao encontrado' });

    const novoAtivo = !usuario.ativo;
    await prisma.usuario.update({
      where: { id },
      data: { ativo: novoAtivo },
    });

    await registrarAuditoria(prisma, {
      usuarioId: req.usuario!.id,
      acao: novoAtivo ? 'USUARIO_ATIVADO' : 'USUARIO_DESATIVADO',
      entidade: 'Usuario',
      entidadeId: id,
      ip: req.ip,
    });

    return reply.send({ ok: true, ativo: novoAtivo });
  });
};
