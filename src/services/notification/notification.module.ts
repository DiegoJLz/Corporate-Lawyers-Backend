import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { NotificationService } from './notification.service';
import { EmailChannel } from './channels/email.channel';

// Controller moved to src/modules/notifications/notification.controller.ts (NotificationRestController)
@Global()
@Module({
  imports: [QueueModule],
  providers: [NotificationService, EmailChannel],
  exports: [NotificationService],
})
export class NotificationModule {}
