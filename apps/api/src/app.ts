import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './lib/prisma.js';
import { registrarJwt } from './lib/jwt.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { auditoriaRoutes } from './modules/auditoria/auditoria.routes.js';
import { categoriasRoutes } from './modules/categorias/categorias.routes.js';
import { marcasRoutes } from './modules/marcas/marcas.routes.js';
import { produtosRoutes } from './modules/produtos/produtos.routes.js';
import { clientesRoutes } from './modules/clientes/clientes.routes.js';
import { fornecedoresRoutes } from './modules/fornecedores/fornecedores.routes.js';
import { estoqueRoutes } from './modules/estoque/estoque.routes.js';
import { vendasRoutes } from './modules/vendas/vendas.routes.js';
import { caixaRoutes } from './modules/caixa/caixa.routes.js';
import { configuracoesRoutes } from './modules/configuracoes/configuracoes.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { comprasRoutes } from './modules/compras/compras.routes.js';
import { orcamentosRoutes } from './modules/orcamentos/orcamentos.routes.js';
import { financeiroRoutes } from './modules/financeiro/financeiro.routes.js';
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes.js';
import { backupRoutes } from './modules/backup/backup.routes.js';

export interface BuildAppOptions {
  logger?: boolean;
}

/**
 * Constroi a instancia Fastify sem chamar listen().
 * Usado por server.ts (producao/dev) e por testes (app.inject()).
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  registrarJwt(app);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(usuariosRoutes, { prefix: '/api' });
  await app.register(auditoriaRoutes, { prefix: '/api' });
  await app.register(categoriasRoutes, { prefix: '/api' });
  await app.register(marcasRoutes, { prefix: '/api' });
  await app.register(produtosRoutes, { prefix: '/api' });
  await app.register(clientesRoutes, { prefix: '/api' });
  await app.register(fornecedoresRoutes, { prefix: '/api' });
  await app.register(estoqueRoutes, { prefix: '/api' });
  await app.register(vendasRoutes, { prefix: '/api' });
  await app.register(caixaRoutes, { prefix: '/api' });
  await app.register(configuracoesRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(comprasRoutes, { prefix: '/api' });
  await app.register(orcamentosRoutes, { prefix: '/api' });
  await app.register(financeiroRoutes, { prefix: '/api' });
  await app.register(relatoriosRoutes, { prefix: '/api' });
  await app.register(backupRoutes, { prefix: '/api' });

  return app;
}

export { prisma };
