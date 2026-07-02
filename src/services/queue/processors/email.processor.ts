import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { EMAIL_QUEUE } from '../queue.constants';

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  templateData?: Record<string, unknown>;
  notificationId: string;
}

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, body, notificationId } = job.data;

    this.logger.log(
      `[Mock Email Send] To: ${to} | Subject: ${subject} | Body: ${body}`,
    );

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { sentAt: new Date() },
    });

    this.logger.log(
      `Notification ${notificationId} marked as sent`,
    );
  }
}
