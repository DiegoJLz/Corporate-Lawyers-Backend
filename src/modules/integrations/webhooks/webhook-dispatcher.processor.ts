import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../../core/database/prisma.service';
import { WEBHOOK_QUEUE } from '../../../services/queue/queue.constants';

interface WebhookDeliveryJobData {
  endpointId: string;
  endpointUrl: string;
  endpointSecret: string;
  event: string;
  payload: Record<string, unknown>;
}

@Processor(WEBHOOK_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { endpointId, endpointUrl, endpointSecret, event, payload } =
      job.data;

    const timestamp = Date.now().toString();
    const body = JSON.stringify(payload);

    // Sign the payload with HMAC-SHA256 using the endpoint secret
    const signature = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    try {
      const response = await axios.post(endpointUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp,
        },
        timeout: 10000,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      const success =
        response.status >= 200 && response.status < 300;

      // Create delivery record
      await this.prisma.webhookDelivery.create({
        data: {
          endpointId,
          event,
          payload: payload as any,
          statusCode: response.status,
          response:
            typeof response.data === 'string'
              ? response.data.substring(0, 1000)
              : JSON.stringify(response.data).substring(0, 1000),
          attempts: job.attemptsMade + 1,
          success,
          lastError: success ? null : `HTTP ${response.status}`,
        },
      });

      if (!success) {
        this.logger.warn(
          `Webhook delivery to ${endpointUrl} returned ${response.status}`,
        );
        throw new Error(
          `Webhook delivery failed with status ${response.status}`,
        );
      }

      this.logger.log(
        `Webhook delivered successfully to ${endpointUrl} (event: ${event})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Only create a delivery record on network/timeout errors (not re-thrown status errors)
      if (!errorMessage.startsWith('Webhook delivery failed with status')) {
        await this.prisma.webhookDelivery.create({
          data: {
            endpointId,
            event,
            payload: payload as any,
            statusCode: null,
            response: null,
            attempts: job.attemptsMade + 1,
            success: false,
            lastError: errorMessage.substring(0, 500),
          },
        });
      }

      this.logger.error(
        `Webhook delivery failed for ${endpointUrl}: ${errorMessage}`,
      );

      // Re-throw to trigger BullMQ retry
      throw error;
    }
  }
}
