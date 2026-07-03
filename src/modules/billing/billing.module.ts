import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import { CaseModule } from '../case/case.module';
import { TimeEntryController } from './time-entry.controller';
import { TimeEntryService } from './time-entry.service';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [PrismaModule, AuditModule, CaseModule],
  controllers: [TimeEntryController, ExpenseController, InvoiceController, PaymentController],
  providers: [TimeEntryService, ExpenseService, InvoiceService, PaymentService],
  exports: [TimeEntryService, ExpenseService, InvoiceService, PaymentService],
})
export class BillingModule {}
