import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { EmailChannel } from './channels/email.channel';

@Global()
@Module({
  imports: [QueueModule],
  controllers: [NotificationController],
  providers: [NotificationService, EmailChannel],
  exports: [NotificationService],
})
export class NotificationModule {}
