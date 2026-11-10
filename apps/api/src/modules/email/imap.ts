// Fonte IMAP (imapflow, MIT). NAO foi exercitada contra caixa real: este codigo so e
// testado com .eml e com fontes simuladas. Antes de declarar a integracao pronta e
// preciso um teste de recebimento real, com autorizacao do dono da conta.
//
// Credenciais: SOMENTE variaveis de ambiente (nunca arquivo versionado, nunca log).
//   EMAIL_IMAP_HOST, EMAIL_IMAP_PORT (padrao 993), EMAIL_IMAP_USER
//   EMAIL_IMAP_AUTH = password | oauth2 (padrao password)
//   EMAIL_IMAP_PASSWORD            (modo password; senha de app quando o provedor permitir)
//   EMAIL_OAUTH_ACCESS_TOKEN       (modo oauth2; token de curta duracao)  -- ou tokenProvider injetado
//   EMAIL_IMAP_MAILBOX (INBOX), EMAIL_IMAP_PROCESSED_MAILBOX (opcional), EMAIL_ACCOUNT_LABEL
// Outlook.com/Microsoft 365: autenticacao basica (usuario+senha) em IMAP foi
// descontinuada; e necessario OAuth2 (XOAUTH2) ou Microsoft Graph. Ver
// docs/integrations/nfe-ingestion.md.
import { ImapFlow } from 'imapflow';
import { parseEml } from './eml.js';
import type { EmailBruto, EmailSource } from './tipos.js';

export interface ConfigImap {
  host: string;
  port: number;
  usuario: string;
  modo: 'password' | 'oauth2';
  senha?: string;
  mailbox: string;
  mailboxProcessados?: string;
  rotulo: string;
}

export type ResultadoConfig = { ok: true; config: ConfigImap } | { ok: false; faltando: string[] };

export function configImapDoAmbiente(env: NodeJS.ProcessEnv = process.env): ResultadoConfig {
  const modo = (env.EMAIL_IMAP_AUTH || 'password') === 'oauth2' ? 'oauth2' : 'password';
  const faltando: string[] = [];
  if (!env.EMAIL_IMAP_HOST) faltando.push('EMAIL_IMAP_HOST');
  if (!env.EMAIL_IMAP_USER) faltando.push('EMAIL_IMAP_USER');
  if (modo === 'password' && !env.EMAIL_IMAP_PASSWORD) faltando.push('EMAIL_IMAP_PASSWORD');
  if (modo === 'oauth2' && !env.EMAIL_OAUTH_ACCESS_TOKEN) faltando.push('EMAIL_OAUTH_ACCESS_TOKEN');
  if (faltando.length) return { ok: false, faltando };
  return {
    ok: true,
    config: {
      host: env.EMAIL_IMAP_HOST!, port: Number(env.EMAIL_IMAP_PORT || 993), usuario: env.EMAIL_IMAP_USER!, modo,
      senha: env.EMAIL_IMAP_PASSWORD, mailbox: env.EMAIL_IMAP_MAILBOX || 'INBOX', mailboxProcessados: env.EMAIL_IMAP_PROCESSED_MAILBOX || undefined,
      rotulo: env.EMAIL_ACCOUNT_LABEL || 'caixa-nfe',
    },
  };
}

export type ProvedorToken = () => Promise<string>;

export function criarFonteImap(config: ConfigImap, tokenProvider?: ProvedorToken, env: NodeJS.ProcessEnv = process.env): EmailSource {
  async function conectar(): Promise<ImapFlow> {
    const auth = config.modo === 'oauth2'
      ? { user: config.usuario, accessToken: tokenProvider ? await tokenProvider() : env.EMAIL_OAUTH_ACCESS_TOKEN! }
      : { user: config.usuario, pass: config.senha! };
    const client = new ImapFlow({ host: config.host, port: config.port, secure: true, auth, logger: false });
    await client.connect();
    return client;
  }

  return {
    rotulo: config.rotulo,
    async buscarNaoProcessados(): Promise<EmailBruto[]> {
      const client = await conectar();
      try {
        const lock = await client.getMailboxLock(config.mailbox);
        try {
          const brutos: { uid: number; source: Buffer }[] = [];
          for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
            if (msg.source) brutos.push({ uid: msg.uid, source: msg.source });
          }
          const out: EmailBruto[] = [];
          for (const b of brutos) out.push(await parseEml(b.source, { destinatario: config.usuario, handle: b.uid }));
          return out;
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => undefined);
      }
    },

    /** Marca como lido e COPIA para a pasta de processados; nunca apaga o original. */
    async marcarProcessado(email: EmailBruto): Promise<void> {
      if (typeof email.handle !== 'number') return;
      const client = await conectar();
      try {
        const lock = await client.getMailboxLock(config.mailbox);
        try {
          await client.messageFlagsAdd({ uid: String(email.handle) }, ['\\Seen'], { uid: true });
          if (config.mailboxProcessados) {
            await client.messageCopy({ uid: String(email.handle) }, config.mailboxProcessados, { uid: true }).catch(() => undefined);
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => undefined);
      }
    },
  };
}
