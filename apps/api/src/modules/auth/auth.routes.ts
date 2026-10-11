import type { FastifyPluginAsync } from 'fastify';
import {
  loginSchema,
  refreshSchema,
  trocarSenhaSchema,
  logoutSchema,
} from './auth.schemas.js';
import {
  login,
  refresh,
  trocarSenha,
  logout,
  me,
} from './auth.service.js';
import { authenticate } from '../../middlewares/auth.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Dados invalidos' });
    }
    const ip = req.ip;
    const { status, body } = await login(app, parsed.data.login, parsed.data.senha, ip);
    return reply.code(status).send(body);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: 'Refresh token invalido' });
    }
    const { status, body } = await refresh(app, parsed.data.refreshToken);
    return reply.code(status).send(body);
  });

  app.post('/auth/trocar-senha', { preHandler: authenticate }, async (req, reply) => {
    const parsed = trocarSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: parsed.error.issues[0]?.message || 'Dados invalidos' });
    }
    if (!req.usuario) return reply.code(401).send({ erro: 'Nao autenticado' });
    const { status, body } = await trocarSenha(
      req.usuario.id,
      parsed.data.senhaAtual,
      parsed.data.novaSenha,
    );
    return reply.code(status).send(body);
  });

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      // Logout mesmo sem refresh token valido no body
      return reply.code(200).send({ ok: true });
    }
    if (!req.usuario) return reply.code(401).send({ erro: 'Nao autenticado' });
    const { status, body } = await logout(req.usuario.id, parsed.data.refreshToken);
    return reply.code(status).send(body);
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) => {
    if (!req.usuario) return reply.code(401).send({ erro: 'Nao autenticado' });
    const { status, body } = await me(req.usuario.id);
    return reply.code(status).send(body);
  });
};
