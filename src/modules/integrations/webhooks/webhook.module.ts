import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../../core/database/prisma.module';
import { WEBHOOK_QUEUE } from '../../../services/queue/queue.constants';
import { WebhookService } from './webhook.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookDeliveryProcessor } from './webhook-dispatcher.processor';
import { WebhookController } from './webhook.controller';

@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: WEBHOOK_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookDispatcherService,
    WebhookDeliveryProcessor,
  ],
  exports: [WebhookDispatcherService],
})
export class WebhookModule {}
