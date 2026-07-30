import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserStats() {
    const byRole = await this.prisma.$queryRaw<
      { role: string; count: string }[]
    >`SELECT role, COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL GROUP BY role`;

    const byStatus = await this.prisma.$queryRaw<
      { status: string; count: string }[]
    >`SELECT status, COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL GROUP BY status`;

    return {
      byRole: byRole.map((r) => ({ role: r.role, count: parseInt(r.count, 10) })),
      byStatus: byStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
    };
  }

  async getCaseStats() {
    const byStatus = await this.prisma.$queryRaw<
      { status: string; count: string }[]
    >`SELECT status, COUNT(*)::text AS count FROM cases WHERE deleted_at IS NULL GROUP BY status`;

    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
    };
  }

  async getDocumentStats() {
    const byType = await this.prisma.$queryRaw<
      { type: string; count: string }[]
    >`SELECT type, COUNT(*)::text AS count FROM documents WHERE deleted_at IS NULL GROUP BY type`;

    const confidentialResult = await this.prisma.$queryRaw<
      { count: string }[]
    >`SELECT COUNT(*)::text AS count FROM documents WHERE deleted_at IS NULL AND is_confidential = true`;

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekResult = await this.prisma.$queryRaw<
      { count: string }[]
    >`SELECT COUNT(*)::text AS count FROM documents WHERE deleted_at IS NULL AND created_at >= ${oneWeekAgo}`;

    return {
      byType: byType.map((r) => ({ type: r.type, count: parseInt(r.count, 10) })),
      confidential: parseInt(confidentialResult[0]?.count ?? '0', 10),
      thisWeek: parseInt(thisWeekResult[0]?.count ?? '0', 10),
    };
  }

  async getTimeEntryStats(caseId?: string) {
    const baseWhere = caseId
      ? { caseId, deletedAt: null }
      : { deletedAt: null };

    const entries = await this.prisma.timeEntry.findMany({
      where: baseWhere as any,
      select: {
        hours: true,
        rate: true,
        isBillable: true,
        isBilled: true,
      },
    });

    let totalHours = new Decimal(0);
    let billableHours = new Decimal(0);
    let totalAmount = new Decimal(0);
    let unbilledHours = new Decimal(0);
    let unbilledAmount = new Decimal(0);

    for (const entry of entries) {
      const hours = new Decimal(entry.hours.toString());
      const rate = new Decimal(entry.rate.toString());
      const amount = hours.mul(rate);

      totalHours = totalHours.add(hours);
      totalAmount = totalAmount.add(amount);

      if (entry.isBillable) {
        billableHours = billableHours.add(hours);
      }

      if (entry.isBillable && !entry.isBilled) {
        unbilledHours = unbilledHours.add(hours);
        unbilledAmount = unbilledAmount.add(amount);
      }
    }

    return {
      totalHours: totalHours.toNumber(),
      billableHours: billableHours.toNumber(),
      totalAmount: totalAmount.toNumber(),
      unbilledHours: unbilledHours.toNumber(),
      unbilledAmount: unbilledAmount.toNumber(),
    };
  }

  async getExpenseStats(caseId?: string) {
    const where: any = { deletedAt: null };
    if (caseId) where.caseId = caseId;

    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        amount: true,
        isBillable: true,
      },
    });

    let total = new Decimal(0);
    let billable = new Decimal(0);
    let nonBillable = new Decimal(0);

    for (const expense of expenses) {
      const amount = new Decimal(expense.amount.toString());
      total = total.add(amount);
      if (expense.isBillable) {
        billable = billable.add(amount);
      } else {
        nonBillable = nonBillable.add(amount);
      }
    }

    return {
      total: total.toNumber(),
      billable: billable.toNumber(),
      nonBillable: nonBillable.toNumber(),
    };
  }

  async getInvoiceStats(caseId?: string) {
    const where: any = { deletedAt: null };
    if (caseId) where.caseId = caseId;

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        total: true,
        status: true,
      },
    });

    let totalInvoiced = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalPending = new Decimal(0);
    let totalOverdue = new Decimal(0);

    for (const inv of invoices) {
      const amount = new Decimal(inv.total.toString());
      totalInvoiced = totalInvoiced.add(amount);

      if (inv.status === 'PAID') {
        totalPaid = totalPaid.add(amount);
      } else if (inv.status === 'OVERDUE') {
        totalOverdue = totalOverdue.add(amount);
      } else if (inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID') {
        totalPending = totalPending.add(amount);
      }
    }

    return {
      totalInvoiced: totalInvoiced.toNumber(),
      totalPaid: totalPaid.toNumber(),
      totalPending: totalPending.toNumber(),
      totalOverdue: totalOverdue.toNumber(),
      count: invoices.length,
    };
  }

  async getPaymentStats() {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'COMPLETED' },
      select: {
        amount: true,
        paidAt: true,
      },
    });

    let totalCollected = new Decimal(0);
    let thisMonth = new Decimal(0);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const payment of payments) {
      const amount = new Decimal(payment.amount.toString());
      totalCollected = totalCollected.add(amount);

      if (payment.paidAt >= startOfMonth) {
        thisMonth = thisMonth.add(amount);
      }
    }

    const count = payments.length;
    const average = count > 0 ? totalCollected.div(count).toNumber() : 0;

    return {
      totalCollected: totalCollected.toNumber(),
      thisMonth: thisMonth.toNumber(),
      count,
      average,
    };
  }

  async getLeadStats() {
    const byStatus = await this.prisma.$queryRaw<
      { status: string; count: string }[]
    >`SELECT status, COUNT(*)::text AS count FROM leads GROUP BY status`;

    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
    };
  }

  async getSignatureStats() {
    const byStatus = await this.prisma.$queryRaw<
      { status: string; count: string }[]
    >`SELECT status, COUNT(*)::text AS count FROM document_signatures GROUP BY status`;

    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
    };
  }
}
