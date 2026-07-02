import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType } from '@prisma/client';
import { NotificationService } from '../notification.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EMAIL_QUEUE } from '../../queue/queue.constants';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockNotification = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };

  const mockUser = {
    findUnique: jest.fn(),
  };

  const mockPrisma = {
    get notification() {
      return mockNotification;
    },
    get user() {
      return mockUser;
    },
  };

  const mockEmailQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(EMAIL_QUEUE), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('send', () => {
    it('should create an IN_APP notification in the database', async () => {
      const created = {
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.IN_APP,
        title: 'New case assigned',
        body: 'You have been assigned to case #123',
        data: null,
        readAt: null,
        createdAt: new Date(),
      };
      mockNotification.create.mockResolvedValue(created);

      const result = await service.send({
        userId: 'user-1',
        type: NotificationType.IN_APP,
        title: 'New case assigned',
        body: 'You have been assigned to case #123',
      });

      expect(result).toEqual(created);
      expect(mockNotification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: NotificationType.IN_APP,
          title: 'New case assigned',
          body: 'You have been assigned to case #123',
          data: undefined,
        },
      });
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it('should create an EMAIL notification and add a job to the email queue', async () => {
      const created = {
        id: 'notif-2',
        userId: 'user-1',
        type: NotificationType.EMAIL,
        title: 'Invoice ready',
        body: 'Your invoice is ready for review',
        data: null,
        readAt: null,
        createdAt: new Date(),
      };
      mockNotification.create.mockResolvedValue(created);
      mockUser.findUnique.mockResolvedValue({ email: 'user@example.com' });

      const result = await service.send({
        userId: 'user-1',
        type: NotificationType.EMAIL,
        title: 'Invoice ready',
        body: 'Your invoice is ready for review',
      });

      expect(result).toEqual(created);
      expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
        to: 'user@example.com',
        subject: 'Invoice ready',
        body: 'Your invoice is ready for review',
        notificationId: 'notif-2',
      });
    });

    it('should fetch the user email when sending an EMAIL notification', async () => {
      mockNotification.create.mockResolvedValue({
        id: 'notif-3',
        type: NotificationType.EMAIL,
      });
      mockUser.findUnique.mockResolvedValue({ email: 'lawyer@firm.com' });

      await service.send({
        userId: 'user-42',
        type: NotificationType.EMAIL,
        title: 'Subject',
        body: 'Body',
      });

      expect(mockUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-42' },
        select: { email: true },
      });
    });

    it('should not queue an email if user is not found', async () => {
      mockNotification.create.mockResolvedValue({
        id: 'notif-4',
        type: NotificationType.EMAIL,
      });
      mockUser.findUnique.mockResolvedValue(null);

      await service.send({
        userId: 'ghost-user',
        type: NotificationType.EMAIL,
        title: 'Subject',
        body: 'Body',
      });

      expect(mockUser.findUnique).toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should update readAt for the notification', async () => {
      const existing = { id: 'notif-1', userId: 'user-1', readAt: null };
      const updated = { ...existing, readAt: new Date() };

      mockNotification.findUnique.mockResolvedValue(existing);
      mockNotification.update.mockResolvedValue(updated);

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(result).toEqual(updated);
      expect(mockNotification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      mockNotification.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if userId does not match', async () => {
      mockNotification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
      });

      await expect(
        service.markAsRead('notif-1', 'user-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications for the user', async () => {
      mockNotification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ updated: 5 });
      expect(mockNotification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('findAllForUser', () => {
    it('should return paginated notifications newest first', async () => {
      const notifications = [
        { id: 'notif-2', createdAt: new Date('2026-07-02') },
        { id: 'notif-1', createdAt: new Date('2026-07-01') },
      ];
      mockNotification.findMany.mockResolvedValue(notifications);
      mockNotification.count.mockResolvedValue(25);

      const result = await service.findAllForUser('user-1', {
        limit: 20,
        offset: 0,
        sortOrder: 'desc',
        sortBy: 'createdAt',
      });

      expect(result.data).toEqual(notifications);
      expect(result.meta).toEqual({
        total: 25,
        limit: 20,
        offset: 0,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(mockNotification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockNotification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 7 });
      expect(mockNotification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          readAt: null,
        },
      });
    });
  });
});
