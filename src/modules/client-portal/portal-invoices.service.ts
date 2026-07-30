import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../core/database/prisma.service';
import { PortalInvoiceQueryDto } from './dto/portal-invoice-query.dto';

@Injectable()
export class PortalInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Find All ────────────────────────────────────────────────

  async findAll(query: PortalInvoiceQueryDto, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return {
        data: [],
        meta: { total: 0, limit: query.limit, offset: query.offset, hasNextPage: false, hasPreviousPage: false },
      };
    }

    const where: Prisma.InvoiceWhereInput = {
      clientProfileId: clientProfile.id,
      status: { not: InvoiceStatus.DRAFT },
    };

    if (query.caseId) where.caseId = query.caseId;

    // Filter by status but never allow DRAFT
    if (query.status && query.status !== InvoiceStatus.DRAFT) {
      where.status = query.status;
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          case: { select: { id: true, caseNumber: true, title: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((invoice) => ({ ...invoice, currency: 'MXN' as const })),
      meta: {
        total,
        limit,
        offset,
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
      },
    };
  }

  // ─── Find One ────────────────────────────────────────────────

  async findOne(invoiceId: string, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientProfileId: clientProfile.id,
        status: { not: InvoiceStatus.DRAFT },
      },
      include: {
        case: { select: { id: true, caseNumber: true, title: true } },
        items: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    // Calculate totalPaid and pendingAmount using Decimal
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum.add(new Decimal(p.amount)),
      new Decimal(0),
    );
    const pendingAmount = new Decimal(invoice.total).sub(totalPaid);

    return {
      ...invoice,
      currency: 'MXN' as const,
      totalPaid: totalPaid.toNumber(),
      pendingAmount: pendingAmount.toNumber(),
    };
  }

  // ─── Get Payments ────────────────────────────────────────────

  async getPayments(invoiceId: string, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientProfileId: clientProfile.id,
        status: { not: InvoiceStatus.DRAFT },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    return this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paidAt: 'desc' },
    });
  }

  // ─── Get Summary ────────────────────────────────────────────

  async getSummary(userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return {
        totalInvoiced: 0,
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        clientProfileId: clientProfile.id,
        status: {
          notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED],
        },
      },
      include: {
        payments: { where: { status: 'COMPLETED' } },
      },
    });

    let totalInvoiced = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalPending = new Decimal(0);
    let totalOverdue = new Decimal(0);

    for (const inv of invoices) {
      const total = new Decimal(inv.total);
      const paid = inv.payments.reduce(
        (sum, p) => sum.add(new Decimal(p.amount)),
        new Decimal(0),
      );

      totalInvoiced = totalInvoiced.add(total);
      totalPaid = totalPaid.add(paid);

      if (inv.status === InvoiceStatus.OVERDUE) {
        totalOverdue = totalOverdue.add(total.sub(paid));
      }

      if (inv.status !== InvoiceStatus.PAID) {
        totalPending = totalPending.add(total.sub(paid));
      }
    }

    return {
      totalInvoiced: totalInvoiced.toNumber(),
      totalPaid: totalPaid.toNumber(),
      totalPending: totalPending.toNumber(),
      totalOverdue: totalOverdue.toNumber(),
    };
  }
}
