// RFC 822 (.eml / bytes do IMAP) -> EmailBruto, via mailparser (MIT).
// Message-ID ausente NAO usa valor aleatorio (o backend Python usava id(): nao
// deterministico, quebrava a deduplicacao): usa o SHA-256 dos bytes brutos.
import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import type { EmailBruto } from './tipos.js';

function primeiroDestinatario(to: unknown): string | null {
  const t: any = Array.isArray(to) ? to[0] : to;
  return t?.value?.[0]?.address ?? null;
}

export async function parseEml(raw: Buffer, extra: { destinatario?: string | null; handle?: unknown } = {}): Promise<EmailBruto> {
  const m = await simpleParser(raw);
  const from = m.from?.value?.[0];
  const messageId = (m.messageId ?? '').trim() || `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  return {
    messageId,
    remetente: (from?.address ?? '').toLowerCase(),
    remetenteNome: from?.name || null,
    destinatario: extra.destinatario ?? primeiroDestinatario(m.to),
    assunto: m.subject ?? null,
    corpoTexto: m.text ?? null,
    recebidoEm: m.date ?? new Date(0),
    // ignora imagens inline referenciadas no corpo (logos de assinatura etc.)
    anexos: m.attachments
      .filter((a) => a.content && a.content.length > 0 && !a.related)
      .map((a) => ({ nome: a.filename ?? 'sem-nome', mime: a.contentType ?? 'application/octet-stream', conteudo: a.content })),
    handle: extra.handle,
  };
}
