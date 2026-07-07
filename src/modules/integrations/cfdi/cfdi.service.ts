import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { ICfdiProvider, CfdiInvoiceData } from './providers/cfdi-provider.interface';
import { StampInvoiceDto } from './dto/stamp-invoice.dto';
import { CancelCfdiDto } from './dto/cancel-cfdi.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';

@Injectable()
export class CfdiService {
  private readonly logger = new Logger(CfdiService.name);

  private readonly emisorRfc: string;
  private readonly emisorNombre: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Inject('CFDI_PROVIDER') private readonly cfdiProvider: ICfdiProvider,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {
    this.emisorRfc = this.configService.get<string>('EMISOR_RFC', 'XAXX010101000');
    this.emisorNombre = this.configService.get<string>('EMISOR_NOMBRE', 'Corporate Lawyers S.C.');
  }

  async stampInvoice(invoiceId: string, dto: StampInvoiceDto, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: {
        items: true,
        case: { select: { id: true, caseNumber: true, title: true } },
        clientProfile: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Cannot stamp a DRAFT invoice. Send it first.');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot stamp a CANCELLED invoice.');
    }

    if (invoice.cfdiUuid) {
      throw new ConflictException(`Invoice already has CFDI with UUID: ${invoice.cfdiUuid}`);
    }

    const clientName = invoice.clientProfile.companyName
      ?? `${invoice.clientProfile.user.firstName} ${invoice.clientProfile.user.lastName}`;
    const clientRfc = dto.receptorRfc ?? invoice.clientProfile.rfc ?? 'XAXX010101000';

    const subtotal = new Decimal(invoice.subtotal);
    const total = new Decimal(invoice.total);

    const cfdiData: CfdiInvoiceData = {
      emisor: {
        rfc: this.emisorRfc,
        nombre: this.emisorNombre,
        regimenFiscal: dto.regimenFiscalEmisor ?? '601',
      },
      receptor: {
        rfc: clientRfc,
        nombre: clientName,
        usoCfdi: dto.usoCfdi ?? 'G03',
        domicilioFiscalReceptor: dto.codigoPostalReceptor,
        regimenFiscalReceptor: dto.regimenFiscalReceptor ?? '616',
      },
      conceptos: invoice.items.map((item) => ({
        claveProducto: dto.claveProducto ?? '80121500',
        claveUnidad: dto.claveUnidad ?? 'E48',
        cantidad: new Decimal(item.quantity).toNumber(),
        descripcion: item.description,
        valorUnitario: new Decimal(item.unitPrice).toNumber(),
        importe: new Decimal(item.amount).toNumber(),
      })),
      subtotal: subtotal.toNumber(),
      total: total.toNumber(),
      moneda: 'MXN',
      formaPago: this.mapPaymentMethodToSat(dto.formaPago),
      metodoPago: dto.metodoPago ?? 'PUE',
      serie: 'A',
      folio: invoice.invoiceNumber.split('-').pop() ?? '00001',
    };

    const result = await this.cfdiProvider.stamp(cfdiData);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        cfdiUuid: result.uuid,
        cfdiXmlUrl: result.xmlUrl,
        pdfUrl: result.pdfUrl,
      },
    });

    await this.prisma.caseTimeline.create({
      data: {
        caseId: invoice.caseId,
        eventType: 'CFDI_STAMPED',
        title: `CFDI stamped for invoice ${invoice.invoiceNumber} (UUID: ${result.uuid})`,
        isPublic: false,
        metadata: { cfdiUuid: result.uuid, invoiceNumber: invoice.invoiceNumber } as Prisma.InputJsonValue,
      },
    });

    await this.auditService.log({
      userId,
      action: 'CFDI_STAMP',
      entityType: 'Invoice',
      entityId: invoiceId,
      newValue: { cfdiUuid: result.uuid, xmlUrl: result.xmlUrl },
    });

    await this.webhookDispatcher.dispatch('cfdi.stamped', { invoiceId, cfdiUuid: result.uuid });

    this.logger.log(`CFDI stamped for invoice ${invoice.invoiceNumber}: UUID=${result.uuid}`);

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      cfdiUuid: result.uuid,
      xmlUrl: result.xmlUrl,
      pdfUrl: result.pdfUrl,
      status: result.status,
    };
  }

  async cancelCfdi(invoiceId: string, dto: CancelCfdiDto, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: {
        case: { select: { id: true, caseNumber: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    if (!invoice.cfdiUuid) {
      throw new BadRequestException('Invoice does not have a CFDI to cancel');
    }

    const result = await this.cfdiProvider.cancel(invoice.cfdiUuid, dto.motivo);

    const oldUuid = invoice.cfdiUuid;

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        cfdiUuid: null,
        cfdiXmlUrl: null,
      },
    });

    await this.prisma.caseTimeline.create({
      data: {
        caseId: invoice.caseId,
        eventType: 'CFDI_CANCELLED',
        title: `CFDI cancelled for invoice ${invoice.invoiceNumber} (UUID: ${oldUuid})`,
        isPublic: false,
        metadata: { cfdiUuid: oldUuid, motivo: dto.motivo } as Prisma.InputJsonValue,
      },
    });

    await this.auditService.log({
      userId,
      action: 'CFDI_CANCEL',
      entityType: 'Invoice',
      entityId: invoiceId,
      oldValue: { cfdiUuid: oldUuid },
      newValue: { motivo: dto.motivo },
    });

    this.logger.log(`CFDI cancelled for invoice ${invoice.invoiceNumber}: UUID=${oldUuid}`);

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      cancelledUuid: oldUuid,
      status: result.status,
    };
  }

  async getStatus(invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, cfdiUuid: true, cfdiXmlUrl: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    if (!invoice.cfdiUuid) {
      return {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        hasCfdi: false,
        cfdiUuid: null,
        status: null,
      };
    }

    const result = await this.cfdiProvider.getStatus(invoice.cfdiUuid);

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      hasCfdi: true,
      cfdiUuid: invoice.cfdiUuid,
      xmlUrl: invoice.cfdiXmlUrl,
      status: result.status,
    };
  }

  private mapPaymentMethodToSat(method: string): string {
    // Accept both enum names and SAT codes
    const map: Record<string, string> = {
      BANK_TRANSFER: '03', CREDIT_CARD: '04', DEBIT_CARD: '28', CASH: '01', CHECK: '02',
    };
    // If already a SAT code (2-digit string), pass through
    if (/^\d{2}$/.test(method)) return method;
    return map[method] || '99';
  }

  async downloadXml(invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, cfdiUuid: true, cfdiXmlUrl: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    if (!invoice.cfdiUuid || !invoice.cfdiXmlUrl) {
      throw new BadRequestException('Invoice does not have a CFDI XML');
    }

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      cfdiUuid: invoice.cfdiUuid,
      xmlUrl: invoice.cfdiXmlUrl,
    };
  }
}
