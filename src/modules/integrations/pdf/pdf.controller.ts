import { Controller, Post, Get, Param, ParseUUIDPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvoicePdfGenerator } from './generators/invoice-pdf.generator';
import { CaseSummaryPdfGenerator } from './generators/case-summary-pdf.generator';
import { StorageService } from '../../../services/storage/storage.service';
import { Roles } from '../../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../../core/security/decorators/current-user.decorator';
import { PrismaService } from '../../../core/database/prisma.service';

@ApiTags('PDF Generation')
@ApiBearerAuth()
@Controller({ version: '1', path: 'invoices' })
export class PdfController {
  constructor(
    private readonly invoicePdfGenerator: InvoicePdfGenerator,
    private readonly caseSummaryPdfGenerator: CaseSummaryPdfGenerator,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':id/generate-pdf')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Generate and store PDF for an invoice' })
  async generatePdf(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.invoicePdfGenerator.generate(id);
    return { message: 'PDF generated successfully', pdfUrl: result.pdfUrl };
  }

  @Get(':id/pdf')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER, UserRole.CLIENT)
  @ApiOperation({ summary: 'Get presigned URL for invoice PDF' })
  async getPdfUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id },
      select: { pdfUrl: true, invoiceNumber: true, status: true, clientProfileId: true },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);

    // A4-R FIX: CLIENT ownership + DRAFT exclusion
    if (role === UserRole.CLIENT) {
      const cp = await this.prisma.clientProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!cp || invoice.clientProfileId !== cp.id) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'DRAFT') throw new NotFoundException('Invoice not found');
    }

    if (!invoice.pdfUrl) throw new NotFoundException(`PDF not generated yet for ${invoice.invoiceNumber}`);

    const url = await this.storageService.getPresignedUrl(invoice.pdfUrl);
    return { url, invoiceNumber: invoice.invoiceNumber };
  }
}

// A3: Separate controller for case summary PDF (different base path)
@ApiTags('PDF Generation')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cases' })
export class CasePdfController {
  constructor(private readonly caseSummaryPdfGenerator: CaseSummaryPdfGenerator) {}

  @Post(':id/generate-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Generate case summary PDF' })
  async generateCaseSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    const result = await this.caseSummaryPdfGenerator.generate(id, userId);
    return { message: 'Case summary PDF generated', pdfUrl: result.pdfUrl };
  }
}
