import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageService } from '../message.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { CaseService } from '../../case/case.service';
import { UserRole } from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockSenderLawyer = {
  id: 'lawyer-1',
  firstName: 'Ana',
  lastName: 'Garcia',
  role: UserRole.LAWYER,
};

const mockSenderClient = {
  id: 'client-1',
  firstName: 'Juan',
  lastName: 'Perez',
  role: UserRole.CLIENT,
};

const mockReceiverLawyer = {
  id: 'lawyer-1',
  firstName: 'Ana',
  lastName: 'Garcia',
  role: UserRole.LAWYER,
};

const mockReceiverAdmin = {
  id: 'admin-1',
  firstName: 'Admin',
  lastName: 'User',
  role: UserRole.ADMIN,
};

const mockMessage = {
  id: 'msg-1',
  caseId: 'case-1',
  senderId: 'lawyer-1',
  receiverId: 'client-1',
  content: 'Hola, actualizacion del caso.',
  attachments: null,
  readAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  sender: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia', role: UserRole.LAWYER },
  receiver: { id: 'client-1', firstName: 'Juan', lastName: 'Perez', role: UserRole.CLIENT },
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Caso Test' },
};

const mockCaseRecord = {
  id: 'case-1',
  caseNumber: 'CORP-2026-00001',
  title: 'Caso Test',
  clientProfile: { userId: 'client-1' },
};

const sendDto = {
  caseId: 'case-1',
  receiverId: 'client-1',
  content: 'Hola, actualizacion del caso.',
  attachments: [],
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

describe('MessageService', () => {
  let service: MessageService;

  const mockPrismaClientMessage = createMockModel();
  const mockPrismaCaseAssignment = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaClientProfile = createMockModel();
  const mockPrismaUser = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockNotificationService = { send: jest.fn() };
  const mockCaseService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: PrismaService,
          useValue: {
            get clientMessage() { return mockPrismaClientMessage; },
            get caseAssignment() { return mockPrismaCaseAssignment; },
            get case() { return mockPrismaCase; },
            get clientProfile() { return mockPrismaClientProfile; },
            get user() { return mockPrismaUser; },
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: CaseService,
          useValue: mockCaseService,
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  /**
   * Helper: stub assertMessageAccess to pass for a user.
   * The private method checks user role, case assignment, and client profile.
   * We set up mocks so both sender and receiver pass the access check.
   */
  function stubAccessForUsers(...userIds: string[]) {
    // For assertMessageAccess: user lookup returns ADMIN (unrestricted access)
    mockPrismaUser.findUnique.mockImplementation(({ where }: any) => {
      if (userIds.includes(where.id)) {
        return Promise.resolve({ role: UserRole.ADMIN });
      }
      return Promise.resolve(null);
    });
  }

  /**
   * Helper: stub access for a client user, requiring case assignment checks.
   */
  function stubAccessForClient(clientId: string, lawyerId: string) {
    mockPrismaUser.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === clientId) {
        return Promise.resolve({ role: UserRole.CLIENT, firstName: 'Juan', lastName: 'Perez' });
      }
      if (where.id === lawyerId) {
        return Promise.resolve({ role: UserRole.LAWYER });
      }
      return Promise.resolve(null);
    });
    // Client gets access via clientProfile
    mockPrismaCaseAssignment.findFirst.mockResolvedValue(null);
    mockPrismaCase.findFirst.mockResolvedValue(mockCaseRecord);
  }

  // ─── send ───────────────────────────────────────────────────────

  describe('send', () => {
    it('should create a message', async () => {
      stubAccessForUsers('lawyer-1', 'client-1');
      // After access check, sender lookup for role+name
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.ADMIN }) // assertMessageAccess sender
        .mockResolvedValueOnce({ role: UserRole.ADMIN }) // assertMessageAccess receiver
        .mockResolvedValueOnce(mockSenderLawyer); // sender lookup for role check
      mockPrismaClientMessage.create.mockResolvedValue(mockMessage);

      const result = await service.send(sendDto, 'lawyer-1');

      expect(result).toEqual(mockMessage);
      expect(mockPrismaClientMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            senderId: 'lawyer-1',
            receiverId: 'client-1',
            content: sendDto.content,
          }),
        }),
      );
    });

    it('should send both IN_APP and EMAIL notifications', async () => {
      stubAccessForUsers('lawyer-1', 'client-1');
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.ADMIN })
        .mockResolvedValueOnce({ role: UserRole.ADMIN })
        .mockResolvedValueOnce(mockSenderLawyer);
      mockPrismaClientMessage.create.mockResolvedValue(mockMessage);

      await service.send(sendDto, 'lawyer-1');

      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);
      // IN_APP notification
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          type: 'IN_APP',
          title: 'Nuevo mensaje',
        }),
      );
      // EMAIL notification
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          type: 'EMAIL',
        }),
      );
    });

    it('should forbid client from messaging non-lead-attorney', async () => {
      // Client sends, access check passes via case clientProfile
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.CLIENT }) // assertMessageAccess for sender
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce(null); // no assignment for client
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseRecord); // client is on case

      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.LAWYER }) // assertMessageAccess for receiver
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce({ id: 'asgn-1' }); // receiver has assignment

      // Sender role check
      mockPrismaUser.findUnique.mockResolvedValueOnce(mockSenderClient);
      // Receiver role check (for CLIENT restriction)
      mockPrismaUser.findUnique.mockResolvedValueOnce({ role: UserRole.LAWYER });
      // Check if receiver is LEAD_ATTORNEY -- not found
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce(null);

      const dto = { ...sendDto, receiverId: 'lawyer-2' };

      await expect(service.send(dto, 'client-1')).rejects.toThrow(ForbiddenException);
    });

    it('should allow client to message lead attorney', async () => {
      // Both pass access check
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.CLIENT }) // assertMessageAccess sender
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce(null);
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseRecord);

      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.LAWYER }) // assertMessageAccess receiver
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce({ id: 'asgn-1' });

      // Sender role check
      mockPrismaUser.findUnique.mockResolvedValueOnce(mockSenderClient);
      // Receiver role check
      mockPrismaUser.findUnique.mockResolvedValueOnce({ role: UserRole.LAWYER });
      // Receiver IS lead attorney
      mockPrismaCaseAssignment.findFirst.mockResolvedValueOnce({
        id: 'asgn-lead',
        caseId: 'case-1',
        userId: 'lawyer-1',
        role: 'LEAD_ATTORNEY',
      });

      mockPrismaClientMessage.create.mockResolvedValue(mockMessage);

      const dto = { ...sendDto, receiverId: 'lawyer-1' };
      const result = await service.send(dto, 'client-1');

      expect(result).toEqual(mockMessage);
    });

    it('should log audit entry after sending', async () => {
      stubAccessForUsers('lawyer-1', 'client-1');
      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ role: UserRole.ADMIN })
        .mockResolvedValueOnce({ role: UserRole.ADMIN })
        .mockResolvedValueOnce(mockSenderLawyer);
      mockPrismaClientMessage.create.mockResolvedValue(mockMessage);

      await service.send(sendDto, 'lawyer-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          action: 'SEND_MESSAGE',
          entityType: 'ClientMessage',
          entityId: 'msg-1',
        }),
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated messages and auto-mark as read', async () => {
      // Access check passes (ADMIN)
      mockPrismaUser.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      const messages = [mockMessage];
      mockPrismaClientMessage.findMany.mockResolvedValue(messages);
      mockPrismaClientMessage.count.mockResolvedValue(1);
      mockPrismaClientMessage.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.findAll(
        'case-1',
        'lawyer-1',
        UserRole.ADMIN,
        { caseId: 'case-1' } as any,
      );

      expect(result.data).toEqual(messages);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0 }),
      );
      // Auto-mark as read
      expect(mockPrismaClientMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseId: 'case-1',
            receiverId: 'lawyer-1',
            readAt: null,
          }),
          data: expect.objectContaining({
            readAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return message when user is sender', async () => {
      mockPrismaClientMessage.findUnique.mockResolvedValue(mockMessage);

      const result = await service.findOne('msg-1', 'lawyer-1');

      expect(result).toEqual(mockMessage);
    });

    it('should throw NotFoundException when message does not exist', async () => {
      mockPrismaClientMessage.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'lawyer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is neither sender nor receiver', async () => {
      mockPrismaClientMessage.findUnique.mockResolvedValue(mockMessage);

      await expect(service.findOne('msg-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── markRead ───────────────────────────────────────────────────

  describe('markRead', () => {
    it('should only mark messages where user is receiver', async () => {
      mockPrismaClientMessage.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markRead(['msg-1', 'msg-2'], 'client-1');

      expect(result).toEqual({ updated: 2 });
      expect(mockPrismaClientMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['msg-1', 'msg-2'] },
            receiverId: 'client-1',
            readAt: null,
          }),
          data: expect.objectContaining({
            readAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should return zero updated when no matching unread messages', async () => {
      mockPrismaClientMessage.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markRead(['msg-99'], 'client-1');

      expect(result).toEqual({ updated: 0 });
    });
  });

  // ─── getUnreadCounts ────────────────────────────────────────────

  describe('getUnreadCounts', () => {
    it('should aggregate unread counts per case', async () => {
      mockPrismaClientMessage.findMany.mockResolvedValue([
        { caseId: 'case-1' },
        { caseId: 'case-1' },
        { caseId: 'case-2' },
      ]);

      const result = await service.getUnreadCounts('client-1');

      expect(result).toEqual({
        'case-1': 2,
        'case-2': 1,
      });
      expect(mockPrismaClientMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            receiverId: 'client-1',
            readAt: null,
          }),
        }),
      );
    });

    it('should return empty object when no unread messages', async () => {
      mockPrismaClientMessage.findMany.mockResolvedValue([]);

      const result = await service.getUnreadCounts('client-1');

      expect(result).toEqual({});
    });
  });

  // ─── getUnreadCountForCase ──────────────────────────────────────

  describe('getUnreadCountForCase', () => {
    it('should return unread count for a specific case', async () => {
      mockPrismaClientMessage.count.mockResolvedValue(3);

      const result = await service.getUnreadCountForCase('case-1', 'client-1');

      expect(result).toEqual({ caseId: 'case-1', count: 3 });
      expect(mockPrismaClientMessage.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseId: 'case-1',
            receiverId: 'client-1',
            readAt: null,
          }),
        }),
      );
    });

    it('should return zero when no unread messages for case', async () => {
      mockPrismaClientMessage.count.mockResolvedValue(0);

      const result = await service.getUnreadCountForCase('case-1', 'client-1');

      expect(result).toEqual({ caseId: 'case-1', count: 0 });
    });
  });
});
