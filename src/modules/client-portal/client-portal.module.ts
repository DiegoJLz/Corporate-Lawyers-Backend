import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import { StorageModule } from '../../services/storage/storage.module';
import { PortalDashboardService } from './portal-dashboard.service';
import { PortalDashboardController } from './portal-dashboard.controller';
import { PortalCasesService } from './portal-cases.service';
import { PortalCasesController } from './portal-cases.controller';
import { PortalProfileService } from './portal-profile.service';
import { PortalProfileController } from './portal-profile.controller';
import { PortalDocumentsService } from './portal-documents.service';
import { PortalDocumentsController } from './portal-documents.controller';
import { PortalInvoicesService } from './portal-invoices.service';
import { PortalInvoicesController } from './portal-invoices.controller';
import { PortalCalendarService } from './portal-calendar.service';
import { PortalCalendarController } from './portal-calendar.controller';
import { PortalMessagesService } from './portal-messages.service';
import { PortalMessagesController } from './portal-messages.controller';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule],
  controllers: [
    PortalDashboardController,
    PortalCasesController,
    PortalProfileController,
    PortalDocumentsController,
    PortalInvoicesController,
    PortalCalendarController,
    PortalMessagesController,
  ],
  providers: [
    PortalDashboardService,
    PortalCasesService,
    PortalProfileService,
    PortalDocumentsService,
    PortalInvoicesService,
    PortalCalendarService,
    PortalMessagesService,
  ],
  exports: [
    PortalDashboardService,
    PortalCasesService,
    PortalProfileService,
    PortalDocumentsService,
    PortalInvoicesService,
    PortalCalendarService,
    PortalMessagesService,
  ],
})
export class ClientPortalModule {}
