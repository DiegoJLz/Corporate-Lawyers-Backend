import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import { CaseModule } from '../case/case.module';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';

@Module({
  imports: [PrismaModule, AuditModule, CaseModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessagingModule {}
