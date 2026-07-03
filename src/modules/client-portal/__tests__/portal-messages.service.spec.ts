import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, NotificationType } from '@prisma/client';
import { PortalMessagesService } from '../portal-messages.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationService } from '../../../services/notification/notification.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockClientProfile = { id: 'cp-1' };

const mockCases = [
  { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Case A' },
  { id: 'case-2', caseNumber: 'CORP-2026-00002', title: 'Case B' },
];

const mockLastMessage = {
  id: 'msg-1',
  caseId: 'case-1',
  senderId: 'client-1',
  receiverId: 'lawyer-1',
  content: 'Hello',
  readAt: null,
  createdAt: NOW,
  sender: { id: 'client-1', firstName: 'Carlos', lastName: 'Lopez', role: UserRole.CLIENT },
};

const mockMessages = [
  {
    id: 'msg-1',
    caseId: 'case-1',
    senderId: 'client-1',
    receiverId: 'lawyer-1',
    content: 'Hello',
    createdAt: NOW,
    sender: { id: 'client-1', firstName: 'Carlos', lastName: 'Lopez', role: UserRole.CLIENT },
    receiver: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia', role: UserRole.LAWYER },
  },
];

const mockCreatedMessage = {
  id: 'msg-new',
  caseId: 'case-1',
  senderId: 'client-1',
  receiverId: 'lawyer-1',
  content: 'New message',
  createdAt: NOW,
  sender: { id: 'client-1', firstName: 'Carlos', lastName: 'Lopez', role: UserRole.CLIENT },
  receiver: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia', role: UserRole.LAWYER },
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Case A' },
};

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

describe('PortalMessagesService', () => {
  let service: PortalMessagesService;

  const mockPrismaClientProfile = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaClientMessage = createMockModel();
  const mockPrismaUser = createMockModel();
  const mockPrismaCaseAssignment = createMockModel();

  const mockNotificationService = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalMessagesService,
        {
          provide: PrismaService,
          useValue: {
            get clientProfile() { return mockPrismaClientProfile; },
            get case() { return mockPrismaCase; },
            get clientMessage() { return mockPrismaClientMessage; },
            get user() { return mockPrismaUser; },
            get caseAssignment() { return mockPrismaCaseAssignment; },
          },
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<PortalMessagesService>(PortalMessagesService);
  });

  // Helper: stub assertClientOwnsCase to succeed
  function stubCaseOwnership() {
    mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
    mockPrismaCase.findFirst.mockResolvedValue({ id: 'case-1', clientProfileId: 'cp-1' });
  }

  // ─── getConversations ─────────────────────────────────────────

  describe('getConversations', () => {
    it('should return conversations only from client cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      // case-1 has messages, case-2 does not
      mockPrismaClientMessage.findFirst
        .mockResolvedValueOnce(mockLastMessage) // case-1
        .mockResolvedValueOnce(null);           // case-2 - no messages
      mockPrismaClientMessage.count.mockResolvedValue(1);

      const result = await service.getConversations('client-1');

      expect(result).toHaveLength(1);
      expect(result[0].caseId).toBe('case-1');
      expect(result[0].lastMessage).toEqual(mockLastMessage);
      expect(result[0].unreadCount).toBe(1);
    });

    it('should return empty array when client has no profile', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      const result = await service.getConversations('no-profile');

      expect(result).toEqual([]);
    });

    it('should return empty array when client has no cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([]);

      const result = await service.getConversations('client-1');

      expect(result).toEqual([]);
    });
  });

  // ─── getMessages ──────────────────────────────────────────────

  describe('getMessages', () => {
    it('should auto-mark received messages as read', async () => {
      stubCaseOwnership();
      mockPrismaClientMessage.findMany.mockResolvedValue(mockMessages);
      mockPrismaClientMessage.count.mockResolvedValue(1);
      mockPrismaClientMessage.updateMany.mockResolvedValue({ count: 1 });

      await service.getMessages('case-1', 'client-1', {} as any);

      expect(mockPrismaClientMessage.updateMany).toHaveBeenCalledWith({
        where: {
          caseId: 'case-1',
          receiverId: 'client-1',
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should throw ForbiddenException when client does not own the case', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessages('case-other', 'client-1', {} as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── send ─────────────────────────────────────────────────────

  describe('send', () => {
    it('should validate receiver is LEAD_ATTORNEY on the case', async () => {
      stubCaseOwnership();
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ id: 'lawyer-1', role: UserRole.LAWYER, firstName: 'Ana', lastName: 'Garcia' })  // receiver
        .mockResolvedValueOnce({ firstName: 'Carlos', lastName: 'Lopez' }); // sender
      mockPrismaCaseAssignment.findFirst.mockResolvedValue({
        id: 'asgn-1',
        caseId: 'case-1',
        userId: 'lawyer-1',
        role: 'LEAD_ATTORNEY',
      });
      mockPrismaClientMessage.create.mockResolvedValue(mockCreatedMessage);
      mockNotificationService.send.mockResolvedValue({});

      const result = await service.send('client-1', {
        caseId: 'case-1',
        receiverId: 'lawyer-1',
        content: 'New message',
        attachments: [],
      });

      expect(result).toEqual(mockCreatedMessage);
      expect(mockPrismaCaseAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          caseId: 'case-1',
          userId: 'lawyer-1',
          role: 'LEAD_ATTORNEY',
          removedAt: null,
        },
      });
    });

    it('should reject message when receiver is not assigned as LEAD_ATTORNEY', async () => {
      stubCaseOwnership();
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'lawyer-other',
        role: UserRole.LAWYER,
        firstName: 'Pedro',
        lastName: 'Martinez',
      });
      mockPrismaCaseAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.send('client-1', {
          caseId: 'case-1',
          receiverId: 'lawyer-other',
          content: 'Hello',
          attachments: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow sending to ADMIN without assignment check', async () => {
      stubCaseOwnership();
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ id: 'admin-1', role: UserRole.ADMIN, firstName: 'Admin', lastName: 'User' })
        .mockResolvedValueOnce({ firstName: 'Carlos', lastName: 'Lopez' });
      mockPrismaClientMessage.create.mockResolvedValue(mockCreatedMessage);
      mockNotificationService.send.mockResolvedValue({});

      await service.send('client-1', {
        caseId: 'case-1',
        receiverId: 'admin-1',
        content: 'Question',
        attachments: [],
      });

      // Should NOT check assignment for ADMIN
      expect(mockPrismaCaseAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('should send IN_APP and EMAIL notifications to receiver', async () => {
      stubCaseOwnership();
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ id: 'lawyer-1', role: UserRole.ADMIN, firstName: 'Ana', lastName: 'Garcia' })
        .mockResolvedValueOnce({ firstName: 'Carlos', lastName: 'Lopez' });
      mockPrismaClientMessage.create.mockResolvedValue(mockCreatedMessage);
      mockNotificationService.send.mockResolvedValue({});

      await service.send('client-1', {
        caseId: 'case-1',
        receiverId: 'lawyer-1',
        content: 'New message',
        attachments: [],
      });

      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          type: NotificationType.IN_APP,
        }),
      );
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          type: NotificationType.EMAIL,
        }),
      );
    });

    it('should throw NotFoundException when receiver does not exist', async () => {
      stubCaseOwnership();
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.send('client-1', {
          caseId: 'case-1',
          receiverId: 'nonexistent',
          content: 'Hello',
          attachments: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getUnreadCounts ──────────────────────────────────────────

  describe('getUnreadCounts', () => {
    it('should return unread counts grouped by caseId', async () => {
      mockPrismaClientMessage.findMany.mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'case-1' },
        { caseId: 'case-2' },
      ]);

      const result = await service.getUnreadCounts('client-1');

      expect(result).toEqual({ 'case-1': 2, 'case-2': 1 });
    });

    it('should return empty object when no unread messages', async () => {
      mockPrismaClientMessage.findMany.mockResolvedValue([]);

      const result = await service.getUnreadCounts('client-1');

      expect(result).toEqual({});
    });
  });
});
