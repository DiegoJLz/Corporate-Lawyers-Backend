import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PdfService } from '../pdf.service';
import { TemplateService } from '../../email/templates/template.service';
import { StorageService } from '../../../../services/storage/storage.service';
import { UploadedFile } from '../../../../common/interfaces/uploaded-file.interface';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InvoicePdfGenerator {
  private readonly logger = new Logger(InvoicePdfGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly templateService: TemplateService,
    private readonly storageService: StorageService,
  ) {}

  async generate(invoiceId: string): Promise<{ pdfUrl: string; buffer: Buffer }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: {
        items: true,
        payments: { where: { status: 'COMPLETED' }, orderBy: { paidAt: 'desc' } },
        case: { select: { id: true, caseNumber: true, title: true } },
        clientProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const clientName = invoice.clientProfile.companyName
      ?? `${invoice.clientProfile.user.firstName} ${invoice.clientProfile.user.lastName}`;

    const subtotal = new Decimal(invoice.subtotal);
    const taxRate = new Decimal(invoice.taxRate);
    const taxAmount = new Decimal(invoice.taxAmount);
    const total = new Decimal(invoice.total);

    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum.add(new Decimal(p.amount)),
      new Decimal(0),
    );
    const pendingAmount = total.sub(totalPaid);

    const templateData = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt.toLocaleDateString('es-MX'),
      dueDate: invoice.dueDate.toLocaleDateString('es-MX'),
      clientName,
      clientRfc: invoice.clientProfile.rfc,
      clientAddress: invoice.clientProfile.fiscalAddress,
      caseNumber: invoice.case.caseNumber,
      caseTitle: invoice.case.title,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: new Decimal(item.quantity).toFixed(2),
        unitPrice: new Decimal(item.unitPrice).toFixed(2),
        amount: new Decimal(item.amount).toFixed(2),
      })),
      subtotal: subtotal.toFixed(2),
      taxRate: taxRate.mul(100).toFixed(0),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      pendingAmount: pendingAmount.toFixed(2),
      notes: invoice.notes,
    };

    const html = this.templateService.render('invoice-pdf', templateData);
    const pdfBuffer = await this.pdfService.generateFromHtml(html);

    const key = `invoices/${invoiceId}/${invoice.invoiceNumber}.pdf`;

    const file: UploadedFile = {
      fieldname: 'pdf',
      originalname: `${invoice.invoiceNumber}.pdf`,
      encoding: 'utf-8',
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      buffer: pdfBuffer,
    };

    await this.storageService.upload(file, key);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl: key },
    });

    this.logger.log(`PDF generated and uploaded for invoice ${invoice.invoiceNumber} at ${key}`);

    return { pdfUrl: key, buffer: pdfBuffer };
  }
}
