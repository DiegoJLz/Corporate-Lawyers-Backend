import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, NotificationType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { NotificationService } from '../../services/notification/notification.service';
import { CaseService } from '../case/case.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly caseService: CaseService,
  ) {}

  // ─── Send Message ──────────────────────────────────────────────

  async send(dto: SendMessageDto, senderId: string) {
    // Verify sender has access to the case
    await this.assertMessageAccess(dto.caseId, senderId);

    // Verify receiver has access to the case
    await this.assertMessageAccess(dto.caseId, dto.receiverId);

    // Enforce CLIENT restriction: clients can only message LEAD_ATTORNEY or ADMIN
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { role: true, firstName: true, lastName: true },
    });

    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    if (sender.role === UserRole.CLIENT) {
      const receiver = await this.prisma.user.findUnique({
        where: { id: dto.receiverId },
        select: { role: true },
      });

      if (!receiver) {
        throw new NotFoundException('Receiver not found');
      }

      if (receiver.role !== UserRole.ADMIN && receiver.role !== UserRole.SUPER_ADMIN) {
        // Check if receiver is LEAD_ATTORNEY on this case
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
    }

    const message = await this.prisma.clientMessage.create({
      data: {
        caseId: dto.caseId,
        senderId,
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

    // Send in-app notification
    await this.notificationService.send({
      userId: dto.receiverId,
      type: NotificationType.IN_APP,
      title: 'Nuevo mensaje',
      body: `${sender.firstName} ${sender.lastName} te envió un mensaje en el caso ${(message as any).case?.caseNumber ?? dto.caseId}`,
      data: { messageId: message.id, caseId: dto.caseId },
    });

    // Send email notification
    await this.notificationService.send({
      userId: dto.receiverId,
      type: NotificationType.EMAIL,
      title: `Nuevo mensaje - Caso ${(message as any).case?.caseNumber ?? dto.caseId}`,
      body: `${sender.firstName} ${sender.lastName} te envió un mensaje: "${dto.content.substring(0, 200)}${dto.content.length > 200 ? '...' : ''}"`,
      data: { messageId: message.id, caseId: dto.caseId },
    });

    await this.auditService.log({
      userId: senderId,
      action: 'SEND_MESSAGE',
      entityType: 'ClientMessage',
      entityId: message.id,
      newValue: { caseId: dto.caseId, receiverId: dto.receiverId },
    });

    return message;
  }

  // ─── Find All (paginated + auto-mark read) ────────────────────

  async findAll(caseId: string, userId: string, userRole: string, query: MessageQueryDto) {
    // Verify user has access to the case
    await this.assertMessageAccess(caseId, userId);

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

  // ─── Find One ──────────────────────────────────────────────────

  async findOne(id: string, userId: string) {
    const message = await this.prisma.clientMessage.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${id} not found`);
    }

    if (message.senderId !== userId && message.receiverId !== userId) {
      throw new ForbiddenException('You can only view messages you sent or received');
    }

    return message;
  }

  // ─── Mark Read (batch) ─────────────────────────────────────────

  async markRead(messageIds: string[], userId: string) {
    const result = await this.prisma.clientMessage.updateMany({
      where: {
        id: { in: messageIds },
        receiverId: userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  // ─── Unread Counts (all cases) ─────────────────────────────────

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

  // ─── Unread Count for Case ─────────────────────────────────────

  async getUnreadCountForCase(caseId: string, userId: string) {
    const count = await this.prisma.clientMessage.count({
      where: {
        caseId,
        receiverId: userId,
        readAt: null,
      },
    });

    return { caseId, count };
  }

  // ─── Conversations ─────────────────────────────────────────────

  async getConversations(userId: string, userRole: string) {
    // Get case IDs user has access to
    let caseIds: string[];

    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN) {
      // Admins see all cases with messages
      const casesWithMessages = await this.prisma.clientMessage.findMany({
        select: { caseId: true },
        distinct: ['caseId'],
      });
      caseIds = casesWithMessages.map((m) => m.caseId);
    } else if (userRole === UserRole.CLIENT) {
      // Client: cases via clientProfile
      const clientProfile = await this.prisma.clientProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!clientProfile) return [];

      const cases = await this.prisma.case.findMany({
        where: { clientProfileId: clientProfile.id },
        select: { id: true },
      });
      caseIds = cases.map((c) => c.id);
    } else {
      // Lawyer/Assistant: cases via assignment
      const assignments = await this.prisma.caseAssignment.findMany({
        where: { userId, removedAt: null },
        select: { caseId: true },
      });
      caseIds = assignments.map((a) => a.caseId);
    }

    if (caseIds.length === 0) return [];

    // Get cases that have at least 1 message
    const casesWithMessages = await this.prisma.case.findMany({
      where: {
        id: { in: caseIds },
        messages: { some: {} },
      },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        legalArea: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
    });

    // Build conversation summaries with unread counts
    const conversations = await Promise.all(
      casesWithMessages.map(async (c) => {
        const unreadCount = await this.prisma.clientMessage.count({
          where: {
            caseId: c.id,
            receiverId: userId,
            readAt: null,
          },
        });

        const lastMsg = c.messages[0];
        return {
          caseId: c.id,
          caseNumber: c.caseNumber,
          caseTitle: c.title,
          legalArea: c.legalArea,
          lastMessage: lastMsg
            ? {
                content: lastMsg.content.substring(0, 100) + (lastMsg.content.length > 100 ? '...' : ''),
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
              }
            : null,
          unreadCount,
        };
      }),
    );

    // Sort by lastMessage.createdAt desc
    conversations.sort((a, b) => {
      const dateA = a.lastMessage?.createdAt?.getTime() ?? 0;
      const dateB = b.lastMessage?.createdAt?.getTime() ?? 0;
      return dateB - dateA;
    });

    return conversations;
  }

  // ─── Access Helpers ────────────────────────────────────────────

  /**
   * Assert that a user has access to a case for messaging purposes.
   * Access is granted if:
   * - User is SUPER_ADMIN or ADMIN
   * - User has an active case assignment
   * - User is the client on the case (via clientProfile)
   */
  private async assertMessageAccess(caseId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Admins have unrestricted access
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      return;
    }

    // Check case assignment (lawyers, assistants)
    const assignment = await this.prisma.caseAssignment.findFirst({
      where: { caseId, userId, removedAt: null },
    });

    if (assignment) {
      return;
    }

    // Check client profile link
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId },
      include: {
        clientProfile: { select: { userId: true } },
      },
    });

    if (!caseRecord) {
      throw new NotFoundException(`Case with ID ${caseId} not found`);
    }

    if (caseRecord.clientProfile?.userId === userId) {
      return;
    }

    throw new ForbiddenException('You do not have access to this case');
  }
}
