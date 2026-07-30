import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EMAIL_QUEUE } from '../queue/queue.constants';

interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  generatedByUserId?: string;
  actionUrl?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async send(params: SendNotificationParams) {
    const { userId, type, title, body, data, relatedEntityType, relatedEntityId, generatedByUserId, actionUrl } = params;

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ?? undefined,
        relatedEntityType,
        relatedEntityId,
        generatedByUserId,
        actionUrl,
      },
    });

    this.logger.log(
      `Notification created: ${notification.id} (type=${type}) for user ${userId}`,
    );

    if (type === NotificationType.EMAIL) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user) {
        await this.emailQueue.add('send-email', {
          to: user.email,
          subject: title,
          body,
          notificationId: notification.id,
        });

        this.logger.log(
          `Email job queued for notification ${notification.id}`,
        );
      }
    }

    return notification;
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You can only mark your own notifications as read');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  async findAllForUser(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasNextPage: query.offset + query.limit < total,
        hasPreviousPage: query.offset > 0,
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
}
