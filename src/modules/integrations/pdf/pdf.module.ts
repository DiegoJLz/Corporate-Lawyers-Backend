import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { InvoicePdfGenerator } from './generators/invoice-pdf.generator';
import { CaseSummaryPdfGenerator } from './generators/case-summary-pdf.generator';
import { PdfController, CasePdfController } from './pdf.controller';
import { StorageModule } from '../../../services/storage/storage.module';
import { EmailProviderModule } from '../email/email-provider.module';

@Module({
  imports: [StorageModule, EmailProviderModule],
  controllers: [PdfController, CasePdfController],
  providers: [PdfService, InvoicePdfGenerator, CaseSummaryPdfGenerator],
  exports: [PdfService, InvoicePdfGenerator, CaseSummaryPdfGenerator],
})
export class PdfModule {}
