// JWT helpers — access token (15min) e refresh token (string aleatoria persistida em tabela)
import crypto from 'node:crypto';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { env } from './env.js';

export function registrarJwt(app: FastifyInstance) {
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES },
  });
}

export function signAccessToken(app: FastifyInstance, payload: object): string {
  return app.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES });
}

export function signRefreshToken(): string {
  // String aleatoria de 48 bytes em base64url (~64 chars). Persistimos em
  // tabela RefreshToken (ver modules/auth/auth.service.ts).
  return crypto.randomBytes(48).toString('base64url');
}

export function diasParaMs(dias: number): number {
  return dias * 24 * 60 * 60 * 1000;
}

// Converte "7d" / "15m" / "1h" para ms. Usado para calcular expiraEm do refresh.
export function parseExpiresToMs(expires: string): number {
  const m = /^(\d+)([smhd])$/.exec(expires.trim());
  if (!m) return diasParaMs(7);
  const valor = parseInt(m[1], 10);
  const unidade = m[2];
  switch (unidade) {
    case 's': return valor * 1000;
    case 'm': return valor * 60 * 1000;
    case 'h': return valor * 60 * 60 * 1000;
    case 'd': return valor * 24 * 60 * 60 * 1000;
    default: return diasParaMs(7);
  }
}

export function refreshExpiraEmMs(): number {
  return parseExpiresToMs(env.JWT_REFRESH_EXPIRES);
}
