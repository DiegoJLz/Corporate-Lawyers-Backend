import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    // TODO: Replace with SendGrid integration
    this.logger.log(`[Mock Email] To: ${to} | Subject: ${subject} | Body: ${body}`);
  }
}
