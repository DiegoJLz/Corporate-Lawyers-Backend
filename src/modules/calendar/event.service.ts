import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { AddAttendeeDto } from './dto/add-attendee.dto';
import { AddReminderDto } from './dto/add-reminder.dto';
import { Prisma, UserRole, AttendeeStatus } from '@prisma/client';

@Injectable()
export class EventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────

  async create(dto: CreateEventDto, createdById: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description,
        startDate,
        endDate,
        location: dto.location,
        virtualUrl: dto.virtualUrl,
        isAllDay: dto.isAllDay ?? false,
        caseId: dto.caseId,
        createdById,
      },
    });

    // Create attendees if provided
    if (dto.attendeeIds?.length) {
      await Promise.all(
        dto.attendeeIds.map((userId) =>
          this.prisma.eventAttendee.create({
            data: {
              eventId: event.id,
              userId,
              status: AttendeeStatus.TENTATIVE,
            },
          }),
        ),
      );
    }

    // Create reminders if provided
    if (dto.reminders?.length) {
      await Promise.all(
        dto.reminders.map((reminder) =>
          this.prisma.reminder.create({
            data: {
              eventId: event.id,
              type: reminder.type,
              minutesBefore: reminder.minutesBefore,
            },
          }),
        ),
      );
    }

    // Check schedule conflicts as warnings
    const attendeeUserIds = [createdById, ...(dto.attendeeIds ?? [])];
    const conflicts = await this.checkScheduleConflicts(
      attendeeUserIds,
      startDate,
      endDate,
      event.id,
    );

    await this.auditService.log({
      userId: createdById,
      action: 'CREATE',
      entityType: 'Event',
      entityId: event.id,
    });

    const created = await this.findOne(event.id);

    return {
      ...created,
      warnings: conflicts.length
        ? { scheduleConflicts: conflicts }
        : undefined,
    };
  }

  // ─── Find All ────────────────────────────────────────────────

  async findAll(query: EventQueryDto, userId: string, userRole: UserRole) {
    const where: Prisma.EventWhereInput = { deletedAt: null };

    // C5 FIX: Build visibility and userId filters as AND conditions
    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    const andConditions: Prisma.EventWhereInput[] = [];

    // Non-admin users can only see events they created or are attending
    if (!isAdmin) {
      andConditions.push({
        OR: [
          { createdById: userId },
          { attendees: { some: { userId } } },
        ],
      });
    }

    if (query.type) where.type = query.type;
    if (query.caseId) where.caseId = query.caseId;
    if (query.userId) {
      andConditions.push({
        OR: [
          { createdById: query.userId },
          { attendees: { some: { userId: query.userId } } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    if (query.dateFrom || query.dateTo) {
      where.startDate = {};
      if (query.dateFrom) where.startDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startDate.lte = new Date(query.dateTo);
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'startDate';
    const sortOrder = query.sortOrder ?? 'asc';

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          attendees: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          reminders: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          case: { select: { id: true, caseNumber: true, title: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
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

  async findOne(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        attendees: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        reminders: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    return event;
  }

  // ─── Update ──────────────────────────────────────────────────

  async update(id: string, dto: UpdateEventDto, userId: string, userRole?: UserRole) {
    const event = await this.findOne(id);

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (event.createdById !== userId && !isAdmin) {
      throw new ForbiddenException('Only the event creator or an admin can update this event');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : event.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : event.endDate;

    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        location: dto.location,
        virtualUrl: dto.virtualUrl,
        isAllDay: dto.isAllDay,
        caseId: dto.caseId,
      },
      include: {
        attendees: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        reminders: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'Event',
      entityId: id,
    });

    return updated;
  }

  // ─── Remove (soft delete) ────────────────────────────────────

  async remove(id: string, userId: string, userRole?: UserRole) {
    const event = await this.findOne(id);

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (event.createdById !== userId && !isAdmin) {
      throw new ForbiddenException('Only the event creator or an admin can delete this event');
    }

    await this.prisma.event.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entityType: 'Event',
      entityId: id,
    });
  }

  // ─── Attendees ───────────────────────────────────────────────

  async addAttendee(eventId: string, dto: AddAttendeeDto) {
    await this.findOne(eventId);

    // Verify user exists
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    return this.prisma.eventAttendee.create({
      data: {
        eventId,
        userId: dto.userId,
        status: dto.status ?? AttendeeStatus.TENTATIVE,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async updateAttendeeStatus(
    eventId: string,
    userId: string,
    status: AttendeeStatus,
    currentUserId: string,
    currentUserRole?: UserRole,
  ) {
    await this.findOne(eventId);

    const attendee = await this.prisma.eventAttendee.findFirst({
      where: { eventId, userId },
    });

    if (!attendee) {
      throw new NotFoundException('Attendee not found for this event');
    }

    const isAdmin = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.SUPER_ADMIN;
    if (userId !== currentUserId && !isAdmin) {
      throw new ForbiddenException('You can only update your own attendee status');
    }

    return this.prisma.eventAttendee.update({
      where: { id: attendee.id },
      data: { status },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async removeAttendee(eventId: string, userId: string) {
    await this.findOne(eventId);

    const attendee = await this.prisma.eventAttendee.findFirst({
      where: { eventId, userId },
    });

    if (!attendee) {
      throw new NotFoundException('Attendee not found for this event');
    }

    await this.prisma.eventAttendee.delete({
      where: { id: attendee.id },
    });
  }

  // ─── Reminders ───────────────────────────────────────────────

  async addReminder(eventId: string, dto: AddReminderDto) {
    await this.findOne(eventId);

    return this.prisma.reminder.create({
      data: {
        eventId,
        type: dto.type,
        minutesBefore: dto.minutesBefore,
      },
    });
  }

  async removeReminder(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      throw new NotFoundException(`Reminder with ID ${reminderId} not found`);
    }

    await this.prisma.reminder.delete({
      where: { id: reminderId },
    });
  }

  // ─── Availability ────────────────────────────────────────────

  async getAvailability(userId: string, dateFrom: string, dateTo: string) {
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdById: userId },
          { attendees: { some: { userId } } },
        ],
        startDate: { lte: new Date(dateTo) },
        endDate: { gte: new Date(dateFrom) },
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
        caseId: true,
        createdById: true,
        case: { select: { caseNumber: true, title: true } },
        attendees: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        reminders: true,
      },
      orderBy: { startDate: 'asc' },
    });

    return events;
  }

  // ─── Schedule Conflicts ──────────────────────────────────────

  async checkScheduleConflicts(
    userIds: string[],
    startDate: Date,
    endDate: Date,
    excludeEventId?: string,
  ) {
    const conflicts: Array<{ userId: string; conflictingEvent: { id: string; title: string; startDate: Date; endDate: Date } }> = [];

    for (const userId of userIds) {
      const where: Prisma.EventWhereInput = {
        deletedAt: null,
        OR: [
          { createdById: userId },
          { attendees: { some: { userId } } },
        ],
        // Overlapping: event starts before our end AND ends after our start
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      };

      if (excludeEventId) {
        where.id = { not: excludeEventId };
      }

      const overlapping = await this.prisma.event.findMany({
        where,
        select: { id: true, title: true, startDate: true, endDate: true },
      });

      for (const event of overlapping) {
        conflicts.push({
          userId,
          conflictingEvent: {
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
          },
        });
      }
    }

    return conflicts;
  }
}
