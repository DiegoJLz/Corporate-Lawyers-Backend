import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { WEBHOOK_QUEUE } from '../../../services/queue/queue.constants';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  /**
   * Dispatch a webhook event to all active endpoints subscribed to the event.
   * Each delivery is enqueued as a separate BullMQ job for reliability and retry.
   */
  async dispatch(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        events: { has: event },
      },
    });

    if (endpoints.length === 0) {
      this.logger.debug(
        `No active endpoints subscribed to event "${event}"`,
      );
      return;
    }

    this.logger.log(
      `Dispatching event "${event}" to ${endpoints.length} endpoint(s)`,
    );

    for (const endpoint of endpoints) {
      await this.webhookQueue.add('deliver', {
        endpointId: endpoint.id,
        endpointUrl: endpoint.url,
        endpointSecret: endpoint.secret,
        event,
        payload,
      });
    }
  }
}
