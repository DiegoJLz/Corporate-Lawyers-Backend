import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, NotificationType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PortalMessageQueryDto } from './dto/portal-message-query.dto';
import { PortalSendMessageDto } from './dto/portal-send-message.dto';

@Injectable()
export class PortalMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Get Conversations ───────────────────────────────────────

  async getConversations(userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return [];
    }

    // Get client's cases
    const cases = await this.prisma.case.findMany({
      where: { clientProfileId: clientProfile.id },
      select: {
        id: true,
        caseNumber: true,
        title: true,
      },
    });

    const caseIds = cases.map((c) => c.id);
    if (caseIds.length === 0) return [];

    // Get cases with messages, last message, and unread count
    const conversations = [];

    for (const caseData of cases) {
      const lastMessage = await this.prisma.clientMessage.findFirst({
        where: {
          caseId: caseData.id,
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      // Only return cases that have messages
      if (!lastMessage) continue;

      const unreadCount = await this.prisma.clientMessage.count({
        where: {
          caseId: caseData.id,
          receiverId: userId,
          readAt: null,
        },
      });

      conversations.push({
        caseId: caseData.id,
        caseNumber: caseData.caseNumber,
        caseTitle: caseData.title,
        lastMessage,
        unreadCount,
      });
    }

    return conversations;
  }

  // ─── Get Messages ───────────────────────────────────────────

  async getMessages(caseId: string, userId: string, query: PortalMessageQueryDto) {
    await this.assertClientOwnsCase(caseId, userId);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'asc';

    const where = { caseId };

    const [data, total] = await Promise.all([
      this.prisma.clientMessage.findMany({
        where,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, role: true } },
          receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.clientMessage.count({ where }),
    ]);

    // Auto-mark as read: messages where receiverId=userId and readAt IS NULL
    await this.prisma.clientMessage.updateMany({
      where: {
        caseId,
        receiverId: userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

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

  // ─── Send ───────────────────────────────────────────────────

  async send(userId: string, dto: PortalSendMessageDto) {
    await this.assertClientOwnsCase(dto.caseId, userId);

    // Verify receiver is LEAD_ATTORNEY on this case or ADMIN
    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.receiverId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    if (receiver.role !== UserRole.ADMIN && receiver.role !== UserRole.SUPER_ADMIN) {
      const assignment = await this.prisma.caseAssignment.findFirst({
        where: {
          caseId: dto.caseId,
          userId: dto.receiverId,
          role: 'LEAD_ATTORNEY',
          removedAt: null,
        },
      });

      if (!assignment) {
        throw new ForbiddenException(
          'Clients can only send messages to the lead attorney or administrators',
        );
      }
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    const message = await this.prisma.clientMessage.create({
      data: {
        caseId: dto.caseId,
        senderId: userId,
        receiverId: dto.receiverId,
        content: dto.content,
        attachments: dto.attachments.length > 0 ? dto.attachments : undefined,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });

    // Send IN_APP notification to receiver
    await this.notificationService.send({
      userId: dto.receiverId,
      type: NotificationType.IN_APP,
      title: 'Nuevo mensaje',
      body: `${sender?.firstName} ${sender?.lastName} te envi\u00f3 un mensaje en el caso ${(message as any).case?.caseNumber ?? dto.caseId}`,
      data: { messageId: message.id, caseId: dto.caseId },
    });

    // Send EMAIL notification to receiver
    await this.notificationService.send({
      userId: dto.receiverId,
      type: NotificationType.EMAIL,
      title: `Nuevo mensaje - Caso ${(message as any).case?.caseNumber ?? dto.caseId}`,
      body: `${sender?.firstName} ${sender?.lastName} te envi\u00f3 un mensaje: "${dto.content.substring(0, 200)}${dto.content.length > 200 ? '...' : ''}"`,
      data: { messageId: message.id, caseId: dto.caseId },
    });

    return message;
  }

  // ─── Get Unread Counts ──────────────────────────────────────

  async getUnreadCounts(userId: string) {
    const unreadMessages = await this.prisma.clientMessage.findMany({
      where: {
        receiverId: userId,
        readAt: null,
      },
      select: { caseId: true },
    });

    const counts: Record<string, number> = {};
    for (const msg of unreadMessages) {
      counts[msg.caseId] = (counts[msg.caseId] || 0) + 1;
    }

    return counts;
  }

  // ─── Private Helpers ────────────────────────────────────────

  private async assertClientOwnsCase(caseId: string, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new ForbiddenException('Client profile not found');
    }

    const caseRecord = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        clientProfileId: clientProfile.id,
      },
    });

    if (!caseRecord) {
      throw new ForbiddenException('You do not have access to this case');
    }
  }
}
