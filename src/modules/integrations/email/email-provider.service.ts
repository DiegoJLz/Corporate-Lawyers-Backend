import { Injectable, Inject, Logger } from '@nestjs/common';
import { IEmailProvider, EmailMessage, EmailResult } from './providers/email-provider.interface';
import { TemplateService } from './templates/template.service';

@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);

  constructor(
    @Inject('EMAIL_PROVIDER') private readonly provider: IEmailProvider,
    private readonly templateService: TemplateService,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    this.logger.log(`Sending email to ${Array.isArray(message.to) ? message.to.join(', ') : message.to} | Subject: ${message.subject}`);

    const result = await this.provider.send(message);

    if (result.accepted) {
      this.logger.log(`Email sent successfully via ${result.provider} (messageId: ${result.messageId})`);
    } else {
      this.logger.warn(`Email send failed via ${result.provider}`);
    }

    return result;
  }

  async renderAndSend(
    to: string | string[],
    templateName: string,
    data: Record<string, unknown>,
    options?: { subject?: string; from?: string; replyTo?: string },
  ): Promise<EmailResult> {
    const html = this.templateService.render(templateName, data);

    const subject = options?.subject ?? (data.subject as string) ?? templateName;

    const message: EmailMessage = {
      to,
      subject,
      html,
      ...(options?.from && { from: options.from }),
      ...(options?.replyTo && { replyTo: options.replyTo }),
    };

    return this.send(message);
  }
}
