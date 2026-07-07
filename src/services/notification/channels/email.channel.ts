import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderService } from '../../../modules/integrations/email/email-provider.service';
import { TemplateService } from '../../../modules/integrations/email/templates/template.service';

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly emailProvider: EmailProviderService,
    private readonly templateService: TemplateService,
  ) {}

  async send(to: string, subject: string, body: string, templateName?: string, templateData?: Record<string, any>): Promise<void> {
    try {
      let html: string;

      if (templateName) {
        html = this.templateService.render(templateName, {
          ...templateData,
          title: subject,
          body,
        });
      } else {
        // Generic template fallback
        html = this.templateService.render('new-message', {
          userName: to,
          senderName: 'System',
          caseNumber: '',
          messagePreview: body,
          portalUrl: process.env.PORTAL_URL || 'https://portal.example.com',
        });
      }

      const result = await this.emailProvider.send({
        to,
        subject,
        html,
        text: body,
      });

      if (result.accepted) {
        this.logger.log(`Email sent to ${to}: ${subject} (${result.provider})`);
      } else {
        this.logger.warn(`Email to ${to} not accepted by ${result.provider}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`, (error as Error).stack);
    }
  }
}
