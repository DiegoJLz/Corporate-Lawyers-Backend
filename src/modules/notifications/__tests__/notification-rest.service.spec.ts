import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationRestService } from '../notification-rest.service';
import { PrismaService } from '../../../core/database/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockNotification = (overrides: Partial<any> = {}) => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'IN_APP',
  title: 'Test notification',
  body: 'Notification body',
  readAt: null,
  data: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

// ─── Mock models ────────────────────────────────────────────────────

function createMockModel() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

describe('NotificationRestService', () => {
  let service: NotificationRestService;

  const mockPrismaNotification = createMockModel();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRestService,
        {
          provide: PrismaService,
          useValue: {
            get notification() { return mockPrismaNotification; },
          },
        },
      ],
    }).compile();

    service = module.get<NotificationRestService>(NotificationRestService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return only notifications belonging to the requesting user', async () => {
      const notifications = [mockNotification()];
      mockPrismaNotification.findMany.mockResolvedValue(notifications);
      mockPrismaNotification.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'user-1');

      expect(result.data).toEqual(notifications);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('should filter by isRead=true (readAt not null)', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([]);
      mockPrismaNotification.count.mockResolvedValue(0);

      await service.findAll({ isRead: 'true' } as any, 'user-1');

      expect(mockPrismaNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            readAt: { not: null },
          }),
        }),
      );
    });

    it('should filter by isRead=false (readAt is null)', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([]);
      mockPrismaNotification.count.mockResolvedValue(0);

      await service.findAll({ isRead: 'false' } as any, 'user-1');

      expect(mockPrismaNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            readAt: null,
          }),
        }),
      );
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('should return unread count for the user', async () => {
      mockPrismaNotification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrismaNotification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });

  // ─── markRead ─────────────────────────────────────────────────

  describe('markRead', () => {
    it('should mark specific notifications as read (batch)', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markRead('user-1', {
        notificationIds: ['notif-1', 'notif-2'],
      });

      expect(result).toEqual({ updated: 2 });
      expect(mockPrismaNotification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          id: { in: ['notif-1', 'notif-2'] },
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should mark all unread notifications as read when no IDs provided', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 10 });

      const result = await service.markRead('user-1', {});

      expect(result).toEqual({ updated: 10 });
      expect(mockPrismaNotification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should only update notifications belonging to the user (cannot mark others)', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markRead('user-1', {
        notificationIds: ['notif-owned-by-user-2'],
      });

      // updateMany has userId filter so it won't touch other users' notifications
      expect(mockPrismaNotification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(result).toEqual({ updated: 0 });
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return notification when it belongs to the user', async () => {
      const notification = mockNotification();
      mockPrismaNotification.findUnique.mockResolvedValue(notification);

      const result = await service.findOne('notif-1', 'user-1');

      expect(result).toEqual(notification);
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      mockPrismaNotification.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when notification belongs to another user', async () => {
      const otherUsersNotification = mockNotification({ userId: 'user-2' });
      mockPrismaNotification.findUnique.mockResolvedValue(otherUsersNotification);

      await expect(service.findOne('notif-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
