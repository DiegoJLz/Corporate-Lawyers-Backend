import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PortalEventQueryDto } from './dto/portal-event-query.dto';

@Injectable()
export class PortalCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Find All ────────────────────────────────────────────────

  async findAll(query: PortalEventQueryDto, userId: string) {
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

    // Get all case IDs for this client
    const cases = await this.prisma.case.findMany({
      where: { clientProfileId: clientProfile.id },
      select: { id: true },
    });
    const caseIds = cases.map((c) => c.id);

    // If caseId is provided, verify it belongs to this client
    if (query.caseId) {
      if (!caseIds.includes(query.caseId)) {
        throw new ForbiddenException('You do not have access to this case');
      }
    }

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      OR: [
        {
          caseId: query.caseId
            ? query.caseId
            : caseIds.length > 0
              ? { in: caseIds }
              : undefined,
        },
        { attendees: { some: { userId } } },
      ],
    };

    if (query.type) where.type = query.type;

    // Default dateFrom to today if not specified
    const dateFrom = query.dateFrom ?? new Date().toISOString().split('T')[0];
    where.startDate = { gte: new Date(dateFrom) };

    if (query.dateTo) {
      where.startDate = {
        ...where.startDate as Prisma.DateTimeFilter,
        lte: new Date(query.dateTo),
      };
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'startDate';
    const sortOrder = query.sortOrder ?? 'asc';

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          attendees: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          case: { select: { id: true, caseNumber: true, title: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data,
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

  async findOne(eventId: string, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const caseIds = (
      await this.prisma.case.findMany({
        where: { clientProfileId: clientProfile.id },
        select: { id: true },
      })
    ).map((c) => c.id);

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        OR: [
          { caseId: caseIds.length > 0 ? { in: caseIds } : undefined },
          { attendees: { some: { userId } } },
        ],
      },
      include: {
        attendees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        reminders: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    return event;
  }
}
