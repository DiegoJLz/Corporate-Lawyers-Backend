import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { IEmailProvider, EmailMessage, EmailResult } from './email-provider.interface';

@Injectable()
export class SendGridProvider implements IEmailProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      this.logger.warn('SENDGRID_API_KEY is not configured');
    }
    this.defaultFrom = this.configService.get<string>('MAIL_FROM', 'noreply@corporatelawyers.mx');
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const msg: sgMail.MailDataRequired = {
        to: message.to,
        from: message.from ?? this.defaultFrom,
        subject: message.subject,
        html: message.html,
        ...(message.text && { text: message.text }),
        ...(message.replyTo && { replyTo: message.replyTo }),
        ...(message.attachments?.length && {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content)
              ? a.content.toString('base64')
              : a.content,
            type: a.contentType ?? 'application/octet-stream',
            disposition: 'attachment' as const,
          })),
        }),
      };

      const [response] = await sgMail.send(msg);

      return {
        messageId: response.headers['x-message-id'] ?? `sg-${Date.now()}`,
        accepted: response.statusCode >= 200 && response.statusCode < 300,
        provider: 'sendgrid',
      };
    } catch (error) {
      this.logger.error(`SendGrid send failed: ${error}`, (error as Error).stack);
      return {
        messageId: '',
        accepted: false,
        provider: 'sendgrid',
      };
    }
  }

  async sendBatch(messages: EmailMessage[]): Promise<EmailResult[]> {
    const results: EmailResult[] = [];
    for (const message of messages) {
      const result = await this.send(message);
      results.push(result);
    }
    return results;
  }
}
