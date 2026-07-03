import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';

@Injectable()
export class NotificationRestService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: NotificationQueryDto, userId: string) {
    const where: Prisma.NotificationWhereInput = { userId };

    if (query.isRead === 'true') {
      where.readAt = { not: null };
    } else if (query.isRead === 'false') {
      where.readAt = null;
    }

    if (query.type) {
      where.type = query.type;
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
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

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return { count };
  }

  async markRead(userId: string, dto: MarkNotificationsReadDto) {
    if (dto.notificationIds && dto.notificationIds.length > 0) {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          id: { in: dto.notificationIds },
        },
        data: { readAt: new Date() },
      });

      return { updated: result.count };
    }

    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  async findOne(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return notification;
  }
}
