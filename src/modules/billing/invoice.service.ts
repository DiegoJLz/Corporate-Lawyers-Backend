import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { NotificationService } from '../../services/notification/notification.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { AddInvoiceItemDto } from './dto/add-invoice-item.dto';
import { Prisma, InvoiceStatus, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { INVOICE_NUMBER_PREFIX } from '../../common/constants/app.constants';

const STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  SENT: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  PARTIALLY_PAID: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  OVERDUE: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.CANCELLED],
  CANCELLED: [],
  PAID: [],
};

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateInvoiceDto, userId: string) {
    // Validate client matches case
    const caseData = await this.prisma.case.findFirst({
      where: { id: dto.caseId },
      select: { clientProfileId: true },
    });
    if (!caseData) throw new NotFoundException('Case not found');
    if (caseData.clientProfileId !== dto.clientProfileId) {
      throw new BadRequestException('Client profile does not match the case');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const invoiceNumber = await this.generateInvoiceNumber(tx);

      // C1 FIX: Use Decimal for all financial arithmetic
      let timeEntryTotal = new Decimal(0);
      const timeEntryItems: { description: string; quantity: number; unitPrice: number; amount: number }[] = [];
      if (dto.timeEntryIds?.length) {
        const entries = await tx.timeEntry.findMany({
          where: { id: { in: dto.timeEntryIds }, caseId: dto.caseId, isBillable: true, isBilled: false },
          include: { lawyer: { select: { firstName: true, lastName: true } } },
        });
        if (entries.length !== dto.timeEntryIds.length) {
          throw new BadRequestException('Some time entries are invalid, already billed, or not billable');
        }
        for (const e of entries) {
          const amount = new Decimal(e.hours).mul(e.rate);
          timeEntryTotal = timeEntryTotal.add(amount);
          timeEntryItems.push({
            description: `${e.lawyer.firstName} ${e.lawyer.lastName}: ${e.description}`,
            quantity: new Decimal(e.hours).toNumber(),
            unitPrice: new Decimal(e.rate).toNumber(),
            amount: amount.toNumber(),
          });
        }
      }

      let expenseTotal = new Decimal(0);
      const expenseItems: { description: string; quantity: number; unitPrice: number; amount: number }[] = [];
      if (dto.expenseIds?.length) {
        const expenses = await tx.expense.findMany({
          where: { id: { in: dto.expenseIds }, caseId: dto.caseId, isBillable: true, isBilled: false },
        });
        if (expenses.length !== dto.expenseIds.length) {
          throw new BadRequestException('Some expenses are invalid, already billed, or not billable');
        }
        for (const e of expenses) {
          const amount = new Decimal(e.amount);
          expenseTotal = expenseTotal.add(amount);
          expenseItems.push({ description: `Gasto: ${e.description}`, quantity: 1, unitPrice: amount.toNumber(), amount: amount.toNumber() });
        }
      }

      let manualTotal = new Decimal(0);
      const manualItems = (dto.items ?? []).map((item) => {
        const amount = new Decimal(item.quantity).mul(item.unitPrice);
        manualTotal = manualTotal.add(amount);
        return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: amount.toNumber() };
      });

      const subtotal = timeEntryTotal.add(expenseTotal).add(manualTotal);
      const taxRate = new Decimal(dto.taxRate ?? 0.16);
      const taxAmount = subtotal.mul(taxRate);
      const total = subtotal.add(taxAmount);

      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          caseId: dto.caseId,
          clientProfileId: dto.clientProfileId,
          subtotal,
          taxRate,
          taxAmount,
          total,
          status: InvoiceStatus.DRAFT,
          dueDate: new Date(dto.dueDate),
          notes: dto.notes,
        },
      });

      // Create invoice items
      const allItems = [...timeEntryItems, ...expenseItems, ...manualItems];
      for (const item of allItems) {
        await tx.invoiceItem.create({ data: { invoiceId: invoice.id, ...item } });
      }

      // Mark time entries as billed
      if (dto.timeEntryIds?.length) {
        await tx.timeEntry.updateMany({
          where: { id: { in: dto.timeEntryIds } },
          data: { isBilled: true, invoiceId: invoice.id },
        });
      }

      // Mark expenses as billed
      if (dto.expenseIds?.length) {
        await tx.expense.updateMany({
          where: { id: { in: dto.expenseIds } },
          data: { isBilled: true, invoiceId: invoice.id },
        });
      }

      // Timeline
      await tx.caseTimeline.create({
        data: {
          caseId: dto.caseId,
          eventType: 'INVOICE_CREATED',
          title: `Invoice ${invoiceNumber} created — $${total.toFixed(2)}`,
          isPublic: true,
          metadata: { invoiceNumber, total, dueDate: dto.dueDate } as Prisma.InputJsonValue,
        },
      });

      await this.auditService.log({
        userId, action: 'CREATE', entityType: 'Invoice', entityId: invoice.id,
        newValue: { invoiceNumber, total },
      });

      return this.findOne(invoice.id);
    }, { isolationLevel: 'Serializable' });
  }

  async findAll(query: InvoiceQueryDto, userId: string, userRole: string) {
    const where: Prisma.InvoiceWhereInput = {};
    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;

    // A3 FIX: CLIENT sees own invoices (no DRAFT); LAWYER sees assigned cases
    if (userRole === UserRole.CLIENT) {
      const cp = await this.prisma.clientProfile.findUnique({ where: { userId }, select: { id: true } });
      if (cp) {
        where.clientProfileId = cp.id;
        where.status = { not: InvoiceStatus.DRAFT };
      } else {
        return { data: [], meta: { total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0, hasNextPage: false, hasPreviousPage: false } };
      }
    } else if (!isAdmin) {
      where.case = { assignments: { some: { userId, removedAt: null } } };
    }
    if (query.caseId) where.caseId = query.caseId;
    if (query.clientProfileId) where.clientProfileId = query.clientProfileId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) where.dueDate.gte = new Date(query.dueDateFrom);
      if (query.dueDateTo) where.dueDate.lte = new Date(query.dueDateTo);
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        take: limit, skip: offset,
        include: {
          case: { select: { id: true, caseNumber: true, title: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 } };
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id },
      include: {
        case: { select: { id: true, caseNumber: true, title: true, clientProfileId: true } },
        items: true,
        payments: { orderBy: { paidAt: 'desc' } },
        timeEntries: { select: { id: true, description: true, hours: true, rate: true, date: true } },
        expenses: { select: { id: true, description: true, amount: true, date: true } },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);

    // A4 FIX: Access control
    if (userId && userRole) {
      if (userRole === UserRole.CLIENT) {
        const cp = await this.prisma.clientProfile.findUnique({ where: { userId }, select: { id: true } });
        if (!cp || invoice.clientProfileId !== cp.id) throw new ForbiddenException('No access to this invoice');
        if (invoice.status === InvoiceStatus.DRAFT) throw new ForbiddenException('No access to this invoice');
      } else if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
        const assignment = await this.prisma.caseAssignment.findFirst({
          where: { caseId: invoice.caseId, userId, removedAt: null },
        });
        if (!assignment) throw new ForbiddenException('No access to this invoice');
      }
    }

    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto, userId: string, userRole?: string) {
    // A4 FIX: CLIENT cannot modify invoices
    if (userRole === UserRole.CLIENT) {
      throw new ForbiddenException('Clients cannot modify invoices');
    }
    const invoice = await this.findOne(id, userId, userRole);

    // Status transition
    if (dto.status && dto.status !== invoice.status) {
      const allowed = STATUS_TRANSITIONS[invoice.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Invoice status transition not allowed: ${invoice.status} → ${dto.status}`);
      }

      // Side effects
      if (dto.status === InvoiceStatus.CANCELLED) {
        await this.unmarkBilledEntries(id);
        await this.prisma.caseTimeline.create({
          data: { caseId: invoice.caseId, eventType: 'INVOICE_CANCELLED', title: `Invoice ${invoice.invoiceNumber} cancelled`, isPublic: false },
        });
      }

      if (dto.status === InvoiceStatus.SENT) {
        // Notify client
        const clientProfile = await this.prisma.clientProfile.findFirst({ where: { id: invoice.clientProfileId }, include: { user: true } });
        if (clientProfile) {
          await this.notificationService.send({
            userId: clientProfile.userId,
            type: 'EMAIL',
            title: `Nueva factura: ${invoice.invoiceNumber}`,
            body: `Se ha emitido la factura ${invoice.invoiceNumber} por $${Number(invoice.total).toFixed(2)}. Fecha de vencimiento: ${invoice.dueDate}`,
            data: { invoiceId: id },
          });
        }
        await this.prisma.caseTimeline.create({
          data: { caseId: invoice.caseId, eventType: 'INVOICE_SENT', title: `Invoice ${invoice.invoiceNumber} sent`, isPublic: true },
        });
      }

      if (dto.status === InvoiceStatus.PAID) {
        dto = { ...dto } as any;
        (dto as any).paidAt = new Date();
      }
    }

    // Only DRAFT invoices can have metadata edited freely
    if (invoice.status !== InvoiceStatus.DRAFT && (dto.dueDate || dto.taxRate !== undefined)) {
      if (!dto.status) {
        throw new BadRequestException('Can only edit dueDate/taxRate on DRAFT invoices');
      }
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        taxRate: dto.taxRate,
        notes: dto.notes,
        paidAt: (dto as any).paidAt,
        // Recalculate tax if taxRate changed
        ...(dto.taxRate !== undefined && (() => {
          const sub = new Decimal(invoice.subtotal);
          const tax = sub.mul(dto.taxRate);
          return { taxAmount: tax, total: sub.add(tax) };
        })()),
      },
    });

    await this.auditService.log({ userId, action: 'UPDATE', entityType: 'Invoice', entityId: id });
    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    const invoice = await this.findOne(id);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be deleted');
    }

    await this.unmarkBilledEntries(id);
    await this.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log({ userId, action: 'DELETE', entityType: 'Invoice', entityId: id });
  }

  // ─── Invoice Items ──────────────────────────────────────────

  async addItem(invoiceId: string, dto: AddInvoiceItemDto) {
    const invoice = await this.findOne(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Can only add items to DRAFT invoices');

    const amount = new Decimal(dto.quantity).mul(dto.unitPrice);
    const item = await this.prisma.invoiceItem.create({
      data: { invoiceId, description: dto.description, quantity: dto.quantity, unitPrice: dto.unitPrice, amount },
    });

    await this.recalculateTotals(invoiceId);
    return item;
  }

  async updateItem(invoiceId: string, itemId: string, dto: AddInvoiceItemDto) {
    const invoice = await this.findOne(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Can only edit items on DRAFT invoices');

    const item = await this.prisma.invoiceItem.findFirst({ where: { id: itemId, invoiceId } });
    if (!item) throw new NotFoundException('Invoice item not found');

    const amount = new Decimal(dto.quantity).mul(dto.unitPrice);
    const updated = await this.prisma.invoiceItem.update({
      where: { id: itemId },
      data: { description: dto.description, quantity: dto.quantity, unitPrice: dto.unitPrice, amount },
    });

    await this.recalculateTotals(invoiceId);
    return updated;
  }

  async removeItem(invoiceId: string, itemId: string) {
    const invoice = await this.findOne(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Can only remove items from DRAFT invoices');

    const item = await this.prisma.invoiceItem.findFirst({ where: { id: itemId, invoiceId } });
    if (!item) throw new NotFoundException('Invoice item not found');

    await this.prisma.invoiceItem.delete({ where: { id: itemId } });
    await this.recalculateTotals(invoiceId);
  }

  async getSummary(caseId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { caseId },
      include: { payments: { where: { status: 'COMPLETED' } } },
    });

    let totalInvoiced = new Decimal(0), totalPaid = new Decimal(0), totalPending = new Decimal(0), totalOverdue = new Decimal(0);
    for (const inv of invoices) {
      const status = inv.status as string;
      if (status === 'CANCELLED') continue;
      const t = new Decimal(inv.total);
      const paid = inv.payments.reduce((sum, p) => sum.add(p.amount), new Decimal(0));
      totalInvoiced = totalInvoiced.add(t);
      totalPaid = totalPaid.add(paid);
      if (status === 'OVERDUE') totalOverdue = totalOverdue.add(t.sub(paid));
      if (status !== 'PAID' && status !== 'CANCELLED') totalPending = totalPending.add(t.sub(paid));
    }

    return {
      totalInvoiced: totalInvoiced.toNumber(),
      totalPaid: totalPaid.toNumber(),
      totalPending: totalPending.toNumber(),
      totalOverdue: totalOverdue.toNumber(),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async generateInvoiceNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${INVOICE_NUMBER_PREFIX}-${year}-`;

    const last = await tx.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
    });

    const next = last ? parseInt(last.invoiceNumber.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${next.toString().padStart(5, '0')}`;
  }

  private async recalculateTotals(invoiceId: string) {
    const items = await this.prisma.invoiceItem.findMany({ where: { invoiceId } });
    const subtotal = items.reduce((sum, item) => sum.add(item.amount), new Decimal(0));

    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId } });
    const taxRate = new Decimal(invoice?.taxRate ?? 0.16);
    const taxAmount = subtotal.mul(taxRate);
    const total = subtotal.add(taxAmount);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { subtotal, taxAmount, total },
    });
  }

  private async unmarkBilledEntries(invoiceId: string) {
    await this.prisma.timeEntry.updateMany({
      where: { invoiceId },
      data: { isBilled: false, invoiceId: null },
    });
    await this.prisma.expense.updateMany({
      where: { invoiceId },
      data: { isBilled: false, invoiceId: null },
    });
  }
}
