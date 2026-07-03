import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import { UserModule } from '../user/user.module';
import { LeadController } from './lead.controller';
import { IntakeController } from './intake.controller';
import { LeadService } from './lead.service';
import { IntakeService } from './intake.service';

@Module({
  imports: [PrismaModule, AuditModule, UserModule],
  controllers: [LeadController, IntakeController],
  providers: [LeadService, IntakeService],
  exports: [LeadService],
})
export class CrmModule {}
