import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { NotificationService } from '../../services/notification/notification.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { Prisma, InvoiceStatus, PaymentStatus, CaseAssignmentRole, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { WebhookDispatcherService } from '../../modules/integrations/webhooks/webhook-dispatcher.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  async create(dto: CreatePaymentDto, userId: string) {
    // All validation + creation inside serializable transaction to prevent concurrent overpayment
    return this.prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: dto.invoiceId },
        include: {
          payments: { where: { status: PaymentStatus.COMPLETED } },
          case: {
            select: {
              id: true,
              caseNumber: true,
              assignments: { where: { role: CaseAssignmentRole.LEAD_ATTORNEY, removedAt: null }, select: { userId: true } },
            },
          },
        },
      });

      if (!invoice) throw new NotFoundException('Invoice not found');

      const validStatuses: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];
      if (!validStatuses.includes(invoice.status)) {
        throw new BadRequestException(`Cannot register payment on invoice with status: ${invoice.status}`);
      }

      const totalPaidDec = invoice.payments.reduce((sum: Decimal, p: any) => sum.add(p.amount), new Decimal(0));
      const pendingAmount = new Decimal(invoice.total).sub(totalPaidDec);

      if (new Decimal(dto.amount).gt(pendingAmount)) {
        throw new BadRequestException(`Payment amount ($${dto.amount}) exceeds pending balance ($${pendingAmount.toFixed(2)})`);
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          amount: dto.amount,
          method: dto.method,
          status: PaymentStatus.COMPLETED,
          transactionId: uuidv4(),
          reference: dto.reference,
          notes: dto.notes,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });

      // Calculate new total paid
      const newTotalPaid = totalPaidDec.add(dto.amount);
      const invoiceTotal = new Decimal(invoice.total);

      // Update invoice status
      let newStatus: InvoiceStatus;
      if (newTotalPaid.gte(invoiceTotal)) {
        newStatus = InvoiceStatus.PAID;
        await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: { status: newStatus, paidAt: new Date() },
        });
      } else {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
        await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: { status: newStatus },
        });
      }

      // Timeline entry
      await tx.caseTimeline.create({
        data: {
          caseId: invoice.case.id,
          eventType: newStatus === InvoiceStatus.PAID ? 'INVOICE_PAID' : 'PAYMENT_RECEIVED',
          title: `Payment of $${dto.amount.toFixed(2)} received for invoice ${invoice.invoiceNumber}`,
          isPublic: true,
          metadata: { paymentId: payment.id, amount: dto.amount, method: dto.method, invoiceNumber: invoice.invoiceNumber } as Prisma.InputJsonValue,
        },
      });

      // Notify lead attorney
      const leadAttorney = invoice.case.assignments[0];
      if (leadAttorney) {
        await this.notificationService.send({
          userId: leadAttorney.userId,
          type: 'IN_APP',
          title: `Payment received: $${dto.amount.toFixed(2)}`,
          body: `Payment received for invoice ${invoice.invoiceNumber} on case ${invoice.case.caseNumber}`,
          data: { invoiceId: dto.invoiceId, paymentId: payment.id },
        });
      }

      await this.auditService.log({
        userId, action: 'CREATE', entityType: 'Payment', entityId: payment.id,
        newValue: { amount: dto.amount, invoiceId: dto.invoiceId },
      });

      await this.webhookDispatcher.dispatch('payment.received', { paymentId: payment.id, invoiceId: dto.invoiceId, amount: dto.amount, method: dto.method });

      return payment;
    }, { isolationLevel: 'Serializable' });
  }

  async findAll(query: PaymentQueryDto, userId: string, userRole: string) {
    const where: Prisma.PaymentWhereInput = {};
    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;

    if (!isAdmin) {
      where.invoice = { case: { assignments: { some: { userId, removedAt: null } } } };
    }
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.method) where.method = query.method;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.paidAt = {};
      if (query.dateFrom) where.paidAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.paidAt.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { transactionId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where, orderBy: { [query.sortBy ?? 'paidAt']: query.sortOrder ?? 'desc' },
        take: limit, skip: offset,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 } };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, caseId: true, total: true, status: true } },
      },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
