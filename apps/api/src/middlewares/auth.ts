import type { FastifyReply, FastifyRequest } from 'fastify';

// Usamos req.usuario em vez de req.user para nao conflitar com o
// FastifyRequest.user existente (string | object | Buffer).
declare module 'fastify' {
  interface FastifyRequest {
    usuario?: {
      id: string;
      nome: string;
      login: string;
      papel: string;
    };
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ erro: 'Token nao fornecido' });
  }
  const token = auth.slice(7);
  try {
    const payload = req.server.jwt.verify(token) as { sub: string };
    const { prisma } = await import('../lib/prisma.js');
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) {
      return reply.code(401).send({ erro: 'Usuario invalido ou inativo' });
    }
    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      papel: usuario.papel,
    };
  } catch {
    return reply.code(401).send({ erro: 'Token invalido' });
  }
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.usuario) return reply.code(401).send({ erro: 'Nao autenticado' });
    if (req.usuario.papel === 'ADMIN') return; // ADMIN passa em tudo
    if (!roles.includes(req.usuario.papel)) {
      return reply.code(403).send({ erro: 'Papel nao autorizado' });
    }
  };
}
