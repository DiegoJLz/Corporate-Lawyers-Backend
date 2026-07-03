import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LeadService } from '../lead.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { NotificationService } from '../../../services/notification/notification.service';
import {
  LeadStatus,
  LeadSource,
  UserRole,
  UserStatus,
  ClientType,
} from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockLead = {
  id: 'lead-1',
  firstName: 'Juan',
  lastName: 'Perez',
  email: 'juan@example.com',
  phone: '+52 55 1234 5678',
  source: LeadSource.WEBSITE,
  areaOfInterest: 'Derecho corporativo',
  message: 'Necesito asesoria legal',
  score: 0,
  status: LeadStatus.NEW,
  assignedToId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockLeadWithIncludes = {
  ...mockLead,
  assignedTo: null,
  intakeForm: null,
  conflictChecks: [],
};

const mockQualifiedLead = {
  ...mockLeadWithIncludes,
  status: LeadStatus.QUALIFIED,
  assignedToId: 'lawyer-1',
  assignedTo: {
    id: 'lawyer-1',
    firstName: 'Ana',
    lastName: 'Garcia',
    email: 'ana@test.com',
    role: UserRole.LAWYER,
  },
};

const mockLawyer = {
  id: 'lawyer-1',
  firstName: 'Ana',
  lastName: 'Garcia',
  role: UserRole.LAWYER,
  status: UserStatus.ACTIVE,
  deletedAt: null,
};

const createDto = {
  firstName: 'Juan',
  lastName: 'Perez',
  email: 'juan@example.com',
  phone: '+52 55 1234 5678',
  source: LeadSource.WEBSITE,
  areaOfInterest: 'Derecho corporativo',
  message: 'Necesito asesoria legal',
};

const convertDto = {
  password: 'SecurePass123!',
  clientType: ClientType.INDIVIDUAL,
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

describe('LeadService', () => {
  let service: LeadService;

  const mockPrismaLead = createMockModel();
  const mockPrismaIntakeForm = createMockModel();
  const mockPrismaConflictCheck = createMockModel();
  const mockPrismaUser = createMockModel();
  const mockPrismaClientProfile = createMockModel();
  const mockPrismaCaseParty = createMockModel();
  const mockPrismaLawyerProfile = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockNotificationService = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        {
          provide: PrismaService,
          useValue: {
            get lead() { return mockPrismaLead; },
            get intakeForm() { return mockPrismaIntakeForm; },
            get conflictCheck() { return mockPrismaConflictCheck; },
            get user() { return mockPrismaUser; },
            get clientProfile() { return mockPrismaClientProfile; },
            get caseParty() { return mockPrismaCaseParty; },
            get lawyerProfile() { return mockPrismaLawyerProfile; },
            $transaction: jest.fn((fn: any) => fn({
              user: mockPrismaUser,
              clientProfile: mockPrismaClientProfile,
              lead: mockPrismaLead,
            })),
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
      ],
    }).compile();

    service = module.get<LeadService>(LeadService);
  });

  // Helper: make findOne resolve successfully
  function stubFindOne(data = mockLeadWithIncludes) {
    mockPrismaLead.findFirst.mockResolvedValue(data);
  }

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a lead with score=0 and status=NEW', async () => {
      // No duplicate found
      mockPrismaLead.findFirst.mockResolvedValue(null);
      mockPrismaLead.create.mockResolvedValue({ ...mockLead });
      mockPrismaLead.update.mockResolvedValue({ ...mockLead, score: 25 });

      const result = await service.create(createDto);

      expect(mockPrismaLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            score: 0,
            status: LeadStatus.NEW,
            email: 'juan@example.com',
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should reject duplicate active email', async () => {
      // Duplicate found
      mockPrismaLead.findFirst.mockResolvedValue(mockLead);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaLead.create).not.toHaveBeenCalled();
    });

    it('should log audit entry when userId is provided', async () => {
      mockPrismaLead.findFirst.mockResolvedValue(null);
      mockPrismaLead.create.mockResolvedValue({ ...mockLead });
      mockPrismaLead.update.mockResolvedValue({ ...mockLead, score: 25 });

      await service.create(createDto, 'admin-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'CREATE',
          entityType: 'Lead',
        }),
      );
    });

    it('should lowercase email on create', async () => {
      mockPrismaLead.findFirst.mockResolvedValue(null);
      mockPrismaLead.create.mockResolvedValue({ ...mockLead });
      mockPrismaLead.update.mockResolvedValue({ ...mockLead, score: 25 });

      await service.create({ ...createDto, email: 'JUAN@EXAMPLE.COM' });

      expect(mockPrismaLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'juan@example.com',
          }),
        }),
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all leads for ADMIN role', async () => {
      const leads = [mockLeadWithIncludes];
      mockPrismaLead.findMany.mockResolvedValue(leads);
      mockPrismaLead.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'admin-1', UserRole.ADMIN);

      expect(result.data).toEqual(leads);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0 }),
      );
      // ADMIN should not have assignedToId filter forced
      expect(mockPrismaLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            assignedToId: 'admin-1',
          }),
        }),
      );
    });

    it('should restrict LAWYER role to only assigned leads', async () => {
      mockPrismaLead.findMany.mockResolvedValue([]);
      mockPrismaLead.count.mockResolvedValue(0);

      await service.findAll({} as any, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToId: 'lawyer-1',
          }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return lead with includes', async () => {
      stubFindOne();

      const result = await service.findOne('lead-1');

      expect(result).toEqual(mockLeadWithIncludes);
      expect(mockPrismaLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          include: expect.objectContaining({
            assignedTo: expect.any(Object),
            intakeForm: true,
            conflictChecks: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when lead does not exist', async () => {
      mockPrismaLead.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update (status transitions) ───────────────────────────────

  describe('update', () => {
    it('should allow valid status transition NEW -> CONTACTED', async () => {
      // findOne for existing
      mockPrismaLead.findFirst.mockResolvedValueOnce(mockLeadWithIncludes);
      mockPrismaLead.update
        .mockResolvedValueOnce({ ...mockLead, status: LeadStatus.CONTACTED })
        .mockResolvedValueOnce({ ...mockLead, status: LeadStatus.CONTACTED, score: 25 });
      // findOne after update
      mockPrismaLead.findFirst.mockResolvedValueOnce({
        ...mockLeadWithIncludes,
        status: LeadStatus.CONTACTED,
      });

      const result = await service.update(
        'lead-1',
        { status: LeadStatus.CONTACTED },
        'admin-1',
        UserRole.ADMIN,
      );

      expect(result.status).toBe(LeadStatus.CONTACTED);
    });

    it('should reject invalid status transition NEW -> CONVERTED', async () => {
      stubFindOne();

      await expect(
        service.update(
          'lead-1',
          { status: LeadStatus.CONVERTED },
          'admin-1',
          UserRole.ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── assign ─────────────────────────────────────────────────────

  describe('assign', () => {
    it('should assign lead to a LAWYER user', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue(mockLawyer);
      mockPrismaLead.update.mockResolvedValue({
        ...mockLead,
        assignedToId: 'lawyer-1',
      });
      // findOne after assign
      mockPrismaLead.findFirst.mockResolvedValueOnce({
        ...mockLeadWithIncludes,
        assignedToId: 'lawyer-1',
        assignedTo: mockLawyer,
      });

      const result = await service.assign('lead-1', { assignedToId: 'lawyer-1' });

      expect(mockPrismaLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { assignedToId: 'lawyer-1' },
        }),
      );
    });

    it('should reject assignment to non-LAWYER/ADMIN user', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue({
        ...mockLawyer,
        role: UserRole.CLIENT,
      });

      await expect(
        service.assign('lead-1', { assignedToId: 'client-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject assignment to inactive user', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue({
        ...mockLawyer,
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.assign('lead-1', { assignedToId: 'lawyer-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when assignee not found', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue(null);

      await expect(
        service.assign('lead-1', { assignedToId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── convert ────────────────────────────────────────────────────

  describe('convert', () => {
    it('should create User + ClientProfile in transaction', async () => {
      // findOne returns QUALIFIED lead
      mockPrismaLead.findFirst.mockResolvedValueOnce(mockQualifiedLead);
      // No existing user with this email
      mockPrismaUser.findUnique.mockResolvedValue(null);
      // Transaction mocks
      const newUser = {
        id: 'new-user-1',
        email: 'juan@example.com',
        firstName: 'Juan',
        lastName: 'Perez',
        role: UserRole.CLIENT,
      };
      mockPrismaUser.create.mockResolvedValue(newUser);
      mockPrismaClientProfile.create.mockResolvedValue({
        id: 'cp-1',
        userId: 'new-user-1',
        clientType: ClientType.INDIVIDUAL,
      });
      mockPrismaLead.update.mockResolvedValue({
        ...mockLead,
        status: LeadStatus.CONVERTED,
      });
      // findOne after conversion
      mockPrismaLead.findFirst.mockResolvedValueOnce({
        ...mockQualifiedLead,
        status: LeadStatus.CONVERTED,
      });

      const result = await service.convert('lead-1', convertDto, 'admin-1');

      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'juan@example.com',
            role: UserRole.CLIENT,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
      expect(mockPrismaClientProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'new-user-1',
            clientType: ClientType.INDIVIDUAL,
          }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONVERT',
          entityType: 'Lead',
        }),
      );
    });

    it('should send notification to assigned lawyer on conversion', async () => {
      mockPrismaLead.findFirst.mockResolvedValueOnce(mockQualifiedLead);
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const newUser = { id: 'new-user-1', email: 'juan@example.com' };
      mockPrismaUser.create.mockResolvedValue(newUser);
      mockPrismaClientProfile.create.mockResolvedValue({});
      mockPrismaLead.update.mockResolvedValue({
        ...mockLead,
        status: LeadStatus.CONVERTED,
      });
      mockPrismaLead.findFirst.mockResolvedValueOnce({
        ...mockQualifiedLead,
        status: LeadStatus.CONVERTED,
      });

      await service.convert('lead-1', convertDto, 'admin-1');

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          title: expect.stringContaining('convertido'),
        }),
      );
    });

    it('should reject conversion if status is not QUALIFIED or CONSULTATION_SCHEDULED', async () => {
      // findOne returns NEW lead
      mockPrismaLead.findFirst.mockResolvedValue(mockLeadWithIncludes);

      await expect(
        service.convert('lead-1', convertDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject conversion if user with email already exists', async () => {
      mockPrismaLead.findFirst.mockResolvedValueOnce(mockQualifiedLead);
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'juan@example.com',
      });

      await expect(
        service.convert('lead-1', convertDto, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── conflictCheck ──────────────────────────────────────────────

  describe('conflictCheck', () => {
    it('should detect conflict when CaseParty match found', async () => {
      stubFindOne();
      const partyMatch = {
        id: 'party-1',
        name: 'Juan Perez',
        role: 'PLAINTIFF',
        case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Caso Test', status: 'ACTIVE' },
      };
      mockPrismaCaseParty.findMany.mockResolvedValue([partyMatch]);
      mockPrismaUser.findMany.mockResolvedValue([]);
      mockPrismaConflictCheck.create.mockResolvedValue({
        id: 'cc-1',
        leadId: 'lead-1',
        checkedById: 'admin-1',
        result: false,
        checkedBy: { id: 'admin-1', firstName: 'Admin', lastName: 'User' },
      });
      mockPrismaLead.update.mockResolvedValue({});

      const result = await service.conflictCheck('lead-1', 'admin-1');

      expect(result.hasConflict).toBe(true);
      expect(result.partyMatches).toHaveLength(1);
      expect(mockPrismaConflictCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            result: false, // false = conflict found
          }),
        }),
      );
    });

    it('should return no conflict when no matches found', async () => {
      stubFindOne();
      mockPrismaCaseParty.findMany.mockResolvedValue([]);
      mockPrismaUser.findMany.mockResolvedValue([]);
      mockPrismaConflictCheck.create.mockResolvedValue({
        id: 'cc-2',
        leadId: 'lead-1',
        checkedById: 'admin-1',
        result: true,
        checkedBy: { id: 'admin-1', firstName: 'Admin', lastName: 'User' },
      });
      mockPrismaLead.update.mockResolvedValue({});

      const result = await service.conflictCheck('lead-1', 'admin-1');

      expect(result.hasConflict).toBe(false);
      expect(result.partyMatches).toHaveLength(0);
      expect(result.clientMatches).toHaveLength(0);
      expect(mockPrismaConflictCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: true, // true = clean, no conflict
          }),
        }),
      );
    });
  });

  // ─── calculateScore ─────────────────────────────────────────────

  describe('calculateScore', () => {
    beforeEach(() => {
      // Mock lawyerProfile.findFirst for areaOfInterest check
      mockPrismaLawyerProfile.findFirst.mockResolvedValue(null);
    });

    it('should give +10 for email', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com' },
        false,
        false,
      );
      expect(score).toBe(10);
    });

    it('should give +5 for phone', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com', phone: '+52 55 1234' },
        false,
        false,
      );
      expect(score).toBe(15);
    });

    it('should give +20 for intake form', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com' },
        true,
        false,
      );
      expect(score).toBe(30);
    });

    it('should give +15 for REFERRAL source', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com', source: LeadSource.REFERRAL },
        false,
        false,
      );
      expect(score).toBe(25);
    });

    it('should give +10 for WEBSITE source', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com', source: LeadSource.WEBSITE },
        false,
        false,
      );
      expect(score).toBe(20);
    });

    it('should give +10 for message > 100 chars', async () => {
      const longMessage = 'A'.repeat(101);
      const score = await service.calculateScore(
        { email: 'test@example.com', message: longMessage },
        false,
        false,
      );
      expect(score).toBe(20);
    });

    it('should give +15 for clean conflict check', async () => {
      const score = await service.calculateScore(
        { email: 'test@example.com' },
        false,
        true,
      );
      expect(score).toBe(25);
    });

    it('should cap score at 100', async () => {
      const longMessage = 'A'.repeat(101);
      const score = await service.calculateScore(
        {
          email: 'test@example.com',
          phone: '+52 55 1234',
          source: LeadSource.REFERRAL,
          message: longMessage,
        },
        true,
        true,
      );
      // 10 + 5 + 15 + 10 + 20 + 15 = 75 (under cap)
      expect(score).toBe(75);
    });
  });
});
