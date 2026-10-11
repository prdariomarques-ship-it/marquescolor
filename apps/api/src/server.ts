import { buildApp } from './app.js';
import { env } from './lib/env.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`API Marquescollor Tintas rodando na porta ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const fechar = async (sinal: string) => {
    app.log.info(`${sinal} recebido. Encerrando...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => fechar('SIGINT'));
  process.on('SIGTERM', () => fechar('SIGTERM'));
}

start();
