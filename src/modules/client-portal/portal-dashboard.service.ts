import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PortalDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });

    if (!clientProfile) {
      throw new NotFoundException('Client profile not found');
    }

    const [
      cases,
      recentTimeline,
      pendingInvoices,
      unreadMessages,
      upcomingEvents,
      unreadNotifications,
    ] = await Promise.all([
      // Cases summary
      this.prisma.case.findMany({
        where: { clientProfileId: clientProfile.id },
        select: {
          id: true,
          caseNumber: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          startDate: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),

      // Recent public timeline entries (last 5)
      this.prisma.caseTimeline.findMany({
        where: {
          case: { clientProfileId: clientProfile.id },
          isPublic: true,
        },
        select: {
          id: true,
          caseId: true,
          eventType: true,
          title: true,
          description: true,
          createdAt: true,
          case: {
            select: { caseNumber: true, title: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Pending invoices
      this.prisma.invoice.findMany({
        where: {
          clientProfileId: clientProfile.id,
          status: { in: ['DRAFT', 'SENT', 'OVERDUE'] },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
        },
        orderBy: { dueDate: 'asc' },
      }),

      // Unread messages count
      this.prisma.clientMessage.count({
        where: {
          receiverId: userId,
          readAt: null,
        },
      }),

      // Upcoming events (next 5)
      this.prisma.event.findMany({
        where: {
          attendees: { some: { userId } },
          startDate: { gte: new Date() },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          type: true,
          startDate: true,
          endDate: true,
          location: true,
          virtualUrl: true,
          isAllDay: true,
        },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),

      // Unread notifications count
      this.prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
    ]);

    // Calculate pending invoice totals using Decimal
    let totalPending = new Decimal(0);
    let totalOverdue = new Decimal(0);

    for (const invoice of pendingInvoices) {
      totalPending = totalPending.plus(invoice.total);
      if (invoice.status === 'OVERDUE') {
        totalOverdue = totalOverdue.plus(invoice.total);
      }
    }

    return {
      cases: {
        total: cases.length,
        active: cases.filter((c) => c.status === 'ACTIVE').length,
        recent: cases.slice(0, 5),
      },
      timeline: recentTimeline,
      billing: {
        pendingInvoices: pendingInvoices.length,
        totalPending: totalPending.toFixed(2),
        totalOverdue: totalOverdue.toFixed(2),
      },
      unreadMessages,
      upcomingEvents,
      unreadNotifications,
    };
  }
}
