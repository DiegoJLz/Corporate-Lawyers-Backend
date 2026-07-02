import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import { CaseController } from './case.controller';
import { CaseService } from './case.service';
import { ConflictCheckService } from './conflict-check.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CaseController],
  providers: [CaseService, ConflictCheckService],
  exports: [CaseService],
})
export class CaseModule {}
