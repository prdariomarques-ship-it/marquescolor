export interface AnexoBruto {
  nome: string;
  mime: string;
  conteudo: Buffer;
}

export interface EmailBruto {
  /** Message-ID do cabecalho; se ausente, "sha256:<hash dos bytes brutos>" (deterministico) */
  messageId: string;
  remetente: string;
  remetenteNome: string | null;
  destinatario: string | null;
  assunto: string | null;
  corpoTexto: string | null;
  recebidoEm: Date;
  anexos: AnexoBruto[];
  /** identificador opaco na caixa (ex.: UID IMAP), usado so para marcar como processado */
  handle?: unknown;
}

/** Porta de leitura de caixa de e-mail. Implementacoes: IMAP (imapflow) e, no futuro, Microsoft Graph. */
export interface EmailSource {
  readonly rotulo: string;
  buscarNaoProcessados(): Promise<EmailBruto[]>;
  marcarProcessado(email: EmailBruto): Promise<void>;
}
