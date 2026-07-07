import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IEmailProvider, EmailMessage, EmailResult } from './email-provider.interface';

@Injectable()
export class SmtpProvider implements IEmailProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultFrom = this.configService.get<string>('MAIL_FROM', 'noreply@corporatelawyers.mx');

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      ...(this.configService.get<string>('SMTP_USER') && {
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      }),
    });
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: message.from ?? this.defaultFrom,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        subject: message.subject,
        html: message.html,
        ...(message.text && { text: message.text }),
        ...(message.replyTo && { replyTo: message.replyTo }),
        ...(message.attachments?.length && {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        }),
      });

      return {
        messageId: info.messageId,
        accepted: true,
        provider: 'smtp',
      };
    } catch (error) {
      this.logger.error(`SMTP send failed: ${error}`, (error as Error).stack);
      return {
        messageId: '',
        accepted: false,
        provider: 'smtp',
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
