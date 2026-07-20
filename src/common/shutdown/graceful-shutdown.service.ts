import {
  Injectable,
  Logger,
  OnModuleDestroy,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class GracefulShutdownService
  implements BeforeApplicationShutdown, OnModuleDestroy
{
  private readonly logger = new Logger(GracefulShutdownService.name);

  constructor(
    @InjectQueue('email-queue') private readonly emailQueue: Queue,
    @InjectQueue('webhook-queue') private readonly webhookQueue: Queue,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal received: ${signal ?? 'unknown'}`);

    // Pause both queues so no new jobs are picked up
    await this.emailQueue.pause();
    await this.webhookQueue.pause();
    this.logger.log('Queues paused — waiting for active jobs to finish');

    // Wait up to 10 seconds for active jobs to complete
    const maxWaitMs = 10_000;
    const pollIntervalMs = 500;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const [emailActive, webhookActive] = await Promise.all([
        this.emailQueue.getActiveCount(),
        this.webhookQueue.getActiveCount(),
      ]);

      if (emailActive === 0 && webhookActive === 0) {
        this.logger.log('All active jobs finished');
        return;
      }

      this.logger.log(
        `Waiting for active jobs — email: ${emailActive}, webhook: ${webhookActive}`,
      );
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    this.logger.warn('Timed out waiting for active jobs to complete');
  }

  async onModuleDestroy(): Promise<void> {
    await this.emailQueue.close();
    await this.webhookQueue.close();
    this.logger.log('Queue connections closed — shutdown complete');
  }
}
