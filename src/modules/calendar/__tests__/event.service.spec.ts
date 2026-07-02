import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EventType,
  UserRole,
  AttendeeStatus,
  NotificationType,
} from '@prisma/client';
import { EventService } from '../event.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';

describe('EventService', () => {
  let service: EventService;

  // ── Prisma model mocks ───────────────────────────────────────

  const mockEventModel = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };

  const mockEventAttendeeModel = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockReminderModel = {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  const mockUserModel = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    get event() { return mockEventModel; },
    get eventAttendee() { return mockEventAttendeeModel; },
    get reminder() { return mockReminderModel; },
    get user() { return mockUserModel; },
  };

  const mockAuditService = { log: jest.fn() };

  // ── Shared fixtures ──────────────────────────────────────────

  const creatorId = 'user-creator';
  const otherUserId = 'user-other';
  const adminId = 'user-admin';

  const mockEvent = {
    id: 'event-1',
    title: 'Client Meeting',
    type: EventType.CLIENT_MEETING,
    description: 'Discuss contract',
    startDate: new Date('2026-07-10T09:00:00.000Z'),
    endDate: new Date('2026-07-10T10:00:00.000Z'),
    location: 'Room A',
    virtualUrl: null,
    isAllDay: false,
    caseId: null,
    createdById: creatorId,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEventWithRelations = {
    ...mockEvent,
    attendees: [
      {
        id: 'att-1',
        eventId: 'event-1',
        userId: otherUserId,
        status: AttendeeStatus.TENTATIVE,
        user: { id: otherUserId, email: 'other@test.com', firstName: 'Other', lastName: 'User' },
      },
    ],
    reminders: [
      { id: 'rem-1', eventId: 'event-1', type: NotificationType.EMAIL, minutesBefore: 30 },
    ],
    createdBy: { id: creatorId, email: 'creator@test.com', firstName: 'Creator', lastName: 'User' },
  };

  // ── Module setup ─────────────────────────────────────────────

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuditService.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
  });

  // ─── create ──────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      title: 'Client Meeting',
      type: EventType.CLIENT_MEETING,
      description: 'Discuss contract',
      startDate: '2026-07-10T09:00:00.000Z',
      endDate: '2026-07-10T10:00:00.000Z',
      location: 'Room A',
      attendeeIds: [otherUserId],
      reminders: [{ type: NotificationType.EMAIL, minutesBefore: 30 }],
    };

    it('should create event with attendees and reminders', async () => {
      mockEventModel.create.mockResolvedValue(mockEvent);
      mockEventAttendeeModel.create.mockResolvedValue({
        id: 'att-1',
        eventId: 'event-1',
        userId: otherUserId,
        status: AttendeeStatus.TENTATIVE,
      });
      mockReminderModel.create.mockResolvedValue({
        id: 'rem-1',
        eventId: 'event-1',
        type: NotificationType.EMAIL,
        minutesBefore: 30,
      });
      // No schedule conflicts
      mockEventModel.findMany.mockResolvedValue([]);
      // findOne call after creation
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);

      const result = await service.create(createDto, creatorId);

      expect(mockEventModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Client Meeting',
          type: EventType.CLIENT_MEETING,
          createdById: creatorId,
        }),
      });
      expect(mockEventAttendeeModel.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          userId: otherUserId,
          status: AttendeeStatus.TENTATIVE,
        },
      });
      expect(mockReminderModel.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          type: NotificationType.EMAIL,
          minutesBefore: 30,
        },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'Event',
          entityId: 'event-1',
        }),
      );
      expect(result.title).toBe('Client Meeting');
    });

    it('should throw BadRequestException if endDate <= startDate', async () => {
      const invalidDto = {
        ...createDto,
        startDate: '2026-07-10T10:00:00.000Z',
        endDate: '2026-07-10T09:00:00.000Z',
      };

      await expect(service.create(invalidDto, creatorId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockEventModel.create).not.toHaveBeenCalled();
    });

    it('should return schedule conflict warnings when conflicts exist', async () => {
      mockEventModel.create.mockResolvedValue(mockEvent);
      // Return a conflicting event for the creator
      const conflictingEvent = {
        id: 'event-2',
        title: 'Existing Meeting',
        startDate: new Date('2026-07-10T09:30:00.000Z'),
        endDate: new Date('2026-07-10T10:30:00.000Z'),
      };
      mockEventModel.findMany.mockResolvedValue([conflictingEvent]);
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);

      const result = await service.create(createDto, creatorId);

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.scheduleConflicts.length).toBeGreaterThan(0);
      expect(result.warnings!.scheduleConflicts[0].conflictingEvent.id).toBe(
        'event-2',
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated events', async () => {
      mockEventModel.findMany.mockResolvedValue([mockEventWithRelations]);
      mockEventModel.count.mockResolvedValue(1);

      const result = await service.findAll(
        { limit: 20, offset: 0 } as any,
        adminId,
        UserRole.ADMIN,
      );

      expect(result.data).toEqual([mockEventWithRelations]);
      expect(result.meta).toEqual({
        total: 1,
        limit: 20,
        offset: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('should filter non-admin users to only their own events', async () => {
      mockEventModel.findMany.mockResolvedValue([]);
      mockEventModel.count.mockResolvedValue(0);

      await service.findAll(
        { limit: 20, offset: 0 } as any,
        otherUserId,
        UserRole.LAWYER,
      );

      expect(mockEventModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: [
                  { createdById: otherUserId },
                  { attendees: { some: { userId: otherUserId } } },
                ],
              },
            ]),
          }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return event with attendees and reminders', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);

      const result = await service.findOne('event-1');

      expect(result).toEqual(mockEventWithRelations);
      expect(result.attendees).toHaveLength(1);
      expect(result.reminders).toHaveLength(1);
      expect(mockEventModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'event-1', deletedAt: null },
        include: expect.objectContaining({
          attendees: expect.any(Object),
          reminders: true,
          createdBy: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when event does not exist', async () => {
      mockEventModel.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('should update event when called by creator', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);
      const updatedEvent = { ...mockEventWithRelations, title: 'Updated Meeting' };
      mockEventModel.update.mockResolvedValue(updatedEvent);

      const result = await service.update(
        'event-1',
        { title: 'Updated Meeting' },
        creatorId,
        UserRole.LAWYER,
      );

      expect(mockEventModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1' },
          data: expect.objectContaining({ title: 'Updated Meeting' }),
        }),
      );
      expect(result.title).toBe('Updated Meeting');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'Event',
        }),
      );
    });

    it('should throw ForbiddenException if not creator or admin', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);

      await expect(
        service.update('event-1', { title: 'Hack' }, otherUserId, UserRole.LAWYER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete event and log audit', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);
      mockEventModel.update.mockResolvedValue({
        ...mockEvent,
        deletedAt: new Date(),
      });

      await service.remove('event-1', creatorId, UserRole.LAWYER);

      expect(mockEventModel.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: creatorId,
          action: 'DELETE',
          entityType: 'Event',
          entityId: 'event-1',
        }),
      );
    });

    it('should throw ForbiddenException if not creator or admin', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);

      await expect(
        service.remove('event-1', otherUserId, UserRole.CLIENT),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── addAttendee ─────────────────────────────────────────────

  describe('addAttendee', () => {
    it('should add attendee to event', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);
      mockUserModel.findFirst.mockResolvedValue({
        id: 'user-new',
        email: 'new@test.com',
        firstName: 'New',
        lastName: 'Attendee',
        deletedAt: null,
      });

      const createdAttendee = {
        id: 'att-2',
        eventId: 'event-1',
        userId: 'user-new',
        status: AttendeeStatus.TENTATIVE,
        user: { id: 'user-new', email: 'new@test.com', firstName: 'New', lastName: 'Attendee' },
      };
      mockEventAttendeeModel.create.mockResolvedValue(createdAttendee);

      const result = await service.addAttendee('event-1', { userId: 'user-new' });

      expect(mockEventAttendeeModel.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          userId: 'user-new',
          status: AttendeeStatus.TENTATIVE,
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
      expect(result).toEqual(createdAttendee);
    });
  });

  // ─── updateAttendeeStatus ───────────────────────────────────

  describe('updateAttendeeStatus', () => {
    it('should update attendee status', async () => {
      mockEventModel.findFirst.mockResolvedValue(mockEventWithRelations);
      mockEventAttendeeModel.findFirst.mockResolvedValue({
        id: 'att-1',
        eventId: 'event-1',
        userId: otherUserId,
        status: AttendeeStatus.TENTATIVE,
      });

      const updatedAttendee = {
        id: 'att-1',
        eventId: 'event-1',
        userId: otherUserId,
        status: AttendeeStatus.CONFIRMED,
        user: { id: otherUserId, email: 'other@test.com', firstName: 'Other', lastName: 'User' },
      };
      mockEventAttendeeModel.update.mockResolvedValue(updatedAttendee);

      const result = await service.updateAttendeeStatus(
        'event-1',
        otherUserId,
        AttendeeStatus.CONFIRMED,
        otherUserId,
        UserRole.LAWYER,
      );

      expect(mockEventAttendeeModel.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { status: AttendeeStatus.CONFIRMED },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
      expect(result.status).toBe(AttendeeStatus.CONFIRMED);
    });
  });

  // ─── checkScheduleConflicts ──────────────────────────────────

  describe('checkScheduleConflicts', () => {
    it('should find overlapping events', async () => {
      const overlapping = {
        id: 'event-overlap',
        title: 'Existing Hearing',
        startDate: new Date('2026-07-10T09:30:00.000Z'),
        endDate: new Date('2026-07-10T10:30:00.000Z'),
      };
      mockEventModel.findMany.mockResolvedValue([overlapping]);

      const result = await service.checkScheduleConflicts(
        [creatorId],
        new Date('2026-07-10T09:00:00.000Z'),
        new Date('2026-07-10T10:00:00.000Z'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(creatorId);
      expect(result[0].conflictingEvent.id).toBe('event-overlap');
    });

    it('should exclude specified event from conflict check', async () => {
      mockEventModel.findMany.mockResolvedValue([]);

      await service.checkScheduleConflicts(
        [creatorId],
        new Date('2026-07-10T09:00:00.000Z'),
        new Date('2026-07-10T10:00:00.000Z'),
        'event-1',
      );

      expect(mockEventModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'event-1' },
          }),
        }),
      );
    });
  });
});
