export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  messageId: string;
  accepted: boolean;
  provider: string;
}

export interface IEmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
  sendBatch?(messages: EmailMessage[]): Promise<EmailResult[]>;
}
