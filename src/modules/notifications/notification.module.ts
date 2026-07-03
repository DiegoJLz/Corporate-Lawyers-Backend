import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { NotificationRestService } from './notification-rest.service';
import { NotificationRestController } from './notification.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationRestController],
  providers: [NotificationRestService],
  exports: [NotificationRestService],
})
export class NotificationRestModule {}
