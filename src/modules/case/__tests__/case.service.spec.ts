import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CaseService } from '../case.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { ConflictCheckService } from '../conflict-check.service';
import { WebhookDispatcherService } from '../../integrations/webhooks/webhook-dispatcher.service';
import { AppCacheService } from '../../../common/cache/cache.service';
import {
  CaseStatus,
  CaseAssignmentRole,
  UserRole,
} from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockCase = {
  id: 'case-1',
  caseNumber: 'CORP-2026-00001',
  title: 'Juicio Mercantil',
  description: 'Descripcion del caso',
  type: 'CIVIL',
  status: CaseStatus.INTAKE,
  priority: 'MEDIUM',
  legalArea: 'Mercantil',
  court: 'Juzgado 5to',
  courtFileNumber: 'EXP-2026/001',
  clientProfileId: 'cp-1',
  startDate: NOW,
  closeDate: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockCaseWithIncludes = {
  ...mockCase,
  clientProfile: {
    id: 'cp-1',
    user: { id: 'client-1', firstName: 'Carlos', lastName: 'Lopez', email: 'carlos@test.com' },
  },
  assignments: [
    {
      id: 'asgn-1',
      userId: 'lawyer-1',
      role: CaseAssignmentRole.LEAD_ATTORNEY,
      user: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia', email: 'ana@test.com', role: UserRole.LAWYER },
    },
  ],
  _count: { parties: 0, notes: 0, tasks: 0, caseDocuments: 0 },
};

const mockClientProfile = {
  id: 'cp-1',
  userId: 'client-1',
  user: { id: 'client-1', status: 'ACTIVE', firstName: 'Carlos', lastName: 'Lopez' },
};

const mockLawyer = {
  id: 'lawyer-1',
  firstName: 'Ana',
  lastName: 'Garcia',
  role: UserRole.LAWYER,
  status: 'ACTIVE',
  deletedAt: null,
};

const createDto = {
  title: 'Juicio Mercantil',
  description: 'Descripcion del caso',
  type: 'CIVIL' as any,
  priority: 'MEDIUM' as any,
  legalArea: 'Mercantil',
  court: 'Juzgado 5to',
  courtFileNumber: 'EXP-2026/001',
  clientProfileId: 'cp-1',
  assignedLawyerId: 'lawyer-1',
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

describe('CaseService', () => {
  let service: CaseService;

  const mockPrismaCase = createMockModel();
  const mockPrismaCaseAssignment = createMockModel();
  const mockPrismaCaseParty = createMockModel();
  const mockPrismaCaseNote = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();
  const mockPrismaCaseTask = createMockModel();
  const mockPrismaClientProfile = createMockModel();
  const mockPrismaUser = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockConflictCheckService = { checkByName: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseService,
        {
          provide: PrismaService,
          useValue: {
            get case() { return mockPrismaCase; },
            get caseAssignment() { return mockPrismaCaseAssignment; },
            get caseParty() { return mockPrismaCaseParty; },
            get caseNote() { return mockPrismaCaseNote; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
            get caseTask() { return mockPrismaCaseTask; },
            get clientProfile() { return mockPrismaClientProfile; },
            get user() { return mockPrismaUser; },
            // $transaction executes the callback with a tx that delegates to the same mocks
            $transaction: jest.fn((fn: any) => fn({
              case: mockPrismaCase,
              caseAssignment: mockPrismaCaseAssignment,
              caseTimeline: mockPrismaCaseTimeline,
            })),
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ConflictCheckService,
          useValue: mockConflictCheckService,
        },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn() } },
        { provide: AppCacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), getOrSet: jest.fn((_k: string, fn: () => any) => fn()), invalidatePattern: jest.fn() } },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
  });

  // Helper: make findOne resolve successfully for methods that call it internally
  function stubFindOne(data = mockCaseWithIncludes) {
    mockPrismaCase.findFirst.mockResolvedValue(data);
  }

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a case with auto-generated case number', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaUser.findFirst.mockResolvedValue(mockLawyer);
      mockConflictCheckService.checkByName.mockResolvedValue({ hasConflict: false, matches: [] });
      // generateCaseNumber: no previous case
      mockPrismaCase.findFirst.mockResolvedValueOnce(null);
      mockPrismaCase.create.mockResolvedValue(mockCase);
      // findOne after creation
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseWithIncludes);
      mockPrismaCaseAssignment.create.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.create(createDto, 'admin-1');

      expect(mockPrismaCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseNumber: expect.stringContaining('CORP-'),
            title: createDto.title,
          }),
        }),
      );
      expect(mockConflictCheckService.checkByName).toHaveBeenCalled();
    });

    it('should throw BadRequestException when client profile not found', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when client profile user is inactive', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue({
        ...mockClientProfile,
        user: { ...mockClientProfile.user, status: 'INACTIVE' },
      });

      await expect(service.create(createDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when lawyer is not found or not active LAWYER role', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaUser.findFirst.mockResolvedValue(null);

      await expect(service.create(createDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('should create lead attorney assignment', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaUser.findFirst.mockResolvedValue(mockLawyer);
      mockConflictCheckService.checkByName.mockResolvedValue({ hasConflict: false, matches: [] });
      mockPrismaCase.findFirst.mockResolvedValueOnce(null);
      mockPrismaCase.create.mockResolvedValue(mockCase);
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseWithIncludes);
      mockPrismaCaseAssignment.create.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      await service.create(createDto, 'admin-1');

      expect(mockPrismaCaseAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caseId: mockCase.id,
          userId: createDto.assignedLawyerId,
          role: CaseAssignmentRole.LEAD_ATTORNEY,
        }),
      });
    });

    it('should create a timeline entry for case creation', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaUser.findFirst.mockResolvedValue(mockLawyer);
      mockConflictCheckService.checkByName.mockResolvedValue({ hasConflict: false, matches: [] });
      mockPrismaCase.findFirst.mockResolvedValueOnce(null);
      mockPrismaCase.create.mockResolvedValue(mockCase);
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseWithIncludes);
      mockPrismaCaseAssignment.create.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      await service.create(createDto, 'admin-1');

      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: mockCase.id,
            eventType: 'CASE_CREATED',
          }),
        }),
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const cases = [mockCaseWithIncludes];
      mockPrismaCase.findMany.mockResolvedValue(cases);
      mockPrismaCase.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'admin-1', UserRole.ADMIN);

      expect(result.data).toEqual(cases);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0 }),
      );
    });

    it('should filter by status, type, and priority', async () => {
      mockPrismaCase.findMany.mockResolvedValue([]);
      mockPrismaCase.count.mockResolvedValue(0);

      await service.findAll(
        { status: CaseStatus.ACTIVE, type: 'CIVIL' as any, priority: 'HIGH' as any } as any,
        'admin-1',
        UserRole.ADMIN,
      );

      expect(mockPrismaCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: CaseStatus.ACTIVE,
            type: 'CIVIL',
            priority: 'HIGH',
          }),
        }),
      );
    });

    it('should restrict non-admin users to only assigned cases', async () => {
      mockPrismaCase.findMany.mockResolvedValue([]);
      mockPrismaCase.count.mockResolvedValue(0);

      await service.findAll({} as any, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignments: expect.objectContaining({
              some: expect.objectContaining({ userId: 'lawyer-1' }),
            }),
          }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return case with includes', async () => {
      stubFindOne();

      const result = await service.findOne('case-1');

      expect(result).toEqual(mockCaseWithIncludes);
      expect(mockPrismaCase.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          include: expect.objectContaining({
            clientProfile: expect.any(Object),
            assignments: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaCase.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ─────────────────────────────────────────────────────

  describe('update', () => {
    it('should update case fields', async () => {
      // First findOne call (to check existing)
      mockPrismaCase.findFirst.mockResolvedValueOnce(mockCaseWithIncludes);
      mockPrismaCase.update.mockResolvedValue({ ...mockCase, title: 'Titulo Nuevo' });
      // Second findOne call (return value)
      mockPrismaCase.findFirst.mockResolvedValueOnce({
        ...mockCaseWithIncludes,
        title: 'Titulo Nuevo',
      });

      const result = await service.update('case-1', { title: 'Titulo Nuevo' }, 'admin-1');

      expect(mockPrismaCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          data: expect.objectContaining({ title: 'Titulo Nuevo' }),
        }),
      );
      expect(result.title).toBe('Titulo Nuevo');
    });

    it('should throw BadRequestException if case is CLOSED', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({
        ...mockCaseWithIncludes,
        status: CaseStatus.CLOSED,
      });

      await expect(
        service.update('case-1', { title: 'New' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if case is ARCHIVED', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({
        ...mockCaseWithIncludes,
        status: CaseStatus.ARCHIVED,
      });

      await expect(
        service.update('case-1', { title: 'New' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateStatus ───────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should allow INTAKE -> ACTIVE transition', async () => {
      mockPrismaCase.findFirst
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.INTAKE })
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.ACTIVE });
      mockPrismaCase.update.mockResolvedValue({ ...mockCase, status: CaseStatus.ACTIVE });
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.updateStatus(
        'case-1',
        { status: CaseStatus.ACTIVE },
        'admin-1',
        UserRole.ADMIN,
      );

      expect(mockPrismaCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CaseStatus.ACTIVE }),
        }),
      );
    });

    it('should throw BadRequestException for INTAKE -> CLOSED (invalid)', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({
        ...mockCaseWithIncludes,
        status: CaseStatus.INTAKE,
      });

      await expect(
        service.updateStatus('case-1', { status: CaseStatus.CLOSED }, 'admin-1', UserRole.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow ACTIVE -> IN_HEARING transition', async () => {
      mockPrismaCase.findFirst
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.ACTIVE })
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.IN_HEARING });
      mockPrismaCase.update.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      await service.updateStatus(
        'case-1',
        { status: CaseStatus.IN_HEARING },
        'admin-1',
        UserRole.ADMIN,
      );

      expect(mockPrismaCase.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException for ARCHIVED -> any status', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({
        ...mockCaseWithIncludes,
        status: CaseStatus.ARCHIVED,
      });

      await expect(
        service.updateStatus('case-1', { status: CaseStatus.ACTIVE }, 'admin-1', UserRole.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow CLOSED -> ARCHIVED only for admin', async () => {
      mockPrismaCase.findFirst
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.CLOSED })
        .mockResolvedValueOnce({ ...mockCaseWithIncludes, status: CaseStatus.ARCHIVED });
      mockPrismaCase.update.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      await service.updateStatus(
        'case-1',
        { status: CaseStatus.ARCHIVED },
        'admin-1',
        UserRole.ADMIN,
      );

      expect(mockPrismaCase.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-admin tries CLOSED -> ARCHIVED', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({
        ...mockCaseWithIncludes,
        status: CaseStatus.CLOSED,
      });

      await expect(
        service.updateStatus(
          'case-1',
          { status: CaseStatus.ARCHIVED },
          'lawyer-1',
          UserRole.LAWYER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete the case', async () => {
      stubFindOne();
      mockPrismaCase.update.mockResolvedValue({});

      await service.remove('case-1', 'admin-1');

      expect(mockPrismaCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'Case' }),
      );
    });
  });

  // ─── assignLawyer ───────────────────────────────────────────────

  describe('assignLawyer', () => {
    it('should assign a new lawyer to the case', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'lawyer-2',
        role: UserRole.LAWYER,
        deletedAt: null,
        firstName: 'Pedro',
        lastName: 'Martinez',
      });
      mockPrismaCaseAssignment.findFirst.mockResolvedValue(null);
      mockPrismaCaseAssignment.create.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockPrismaCaseAssignment.findMany.mockResolvedValue([]);

      await service.assignLawyer(
        'case-1',
        { userId: 'lawyer-2' },
        'admin-1',
      );

      expect(mockPrismaCaseAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caseId: 'case-1',
          userId: 'lawyer-2',
          role: CaseAssignmentRole.CO_COUNSEL,
        }),
      });
    });

    it('should demote existing LEAD_ATTORNEY when assigning a new one', async () => {
      stubFindOne();
      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'lawyer-2',
        role: UserRole.LAWYER,
        deletedAt: null,
        firstName: 'Pedro',
        lastName: 'Martinez',
      });
      mockPrismaCaseAssignment.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaCaseAssignment.findFirst.mockResolvedValue(null);
      mockPrismaCaseAssignment.create.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockPrismaCaseAssignment.findMany.mockResolvedValue([]);

      await service.assignLawyer(
        'case-1',
        { userId: 'lawyer-2', role: CaseAssignmentRole.LEAD_ATTORNEY },
        'admin-1',
      );

      expect(mockPrismaCaseAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          caseId: 'case-1',
          role: CaseAssignmentRole.LEAD_ATTORNEY,
          removedAt: null,
        },
        data: { role: CaseAssignmentRole.CO_COUNSEL },
      });
    });
  });

  // ─── addParty ───────────────────────────────────────────────────

  describe('addParty', () => {
    it('should add a party and create a timeline entry', async () => {
      stubFindOne();
      const partyDto = { name: 'Juan Perez', role: 'PLAINTIFF' as any };
      const createdParty = { id: 'party-1', caseId: 'case-1', ...partyDto };
      mockPrismaCaseParty.create.mockResolvedValue(createdParty);
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.addParty('case-1', partyDto, 'admin-1');

      expect(result).toEqual(createdParty);
      expect(mockPrismaCaseParty.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ caseId: 'case-1', name: 'Juan Perez' }),
      });
      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            eventType: 'PARTY_ADDED',
          }),
        }),
      );
    });
  });

  // ─── addNote ────────────────────────────────────────────────────

  describe('addNote', () => {
    it('should add a note and default isInternal to true', async () => {
      stubFindOne();
      const noteDto = { content: 'Nota importante' };
      const createdNote = {
        id: 'note-1',
        caseId: 'case-1',
        authorId: 'lawyer-1',
        content: 'Nota importante',
        isInternal: true,
        author: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
      };
      mockPrismaCaseNote.create.mockResolvedValue(createdNote);
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.addNote('case-1', noteDto, 'lawyer-1');

      expect(result).toEqual(createdNote);
      expect(mockPrismaCaseNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            authorId: 'lawyer-1',
            isInternal: true,
          }),
        }),
      );
    });

    it('should set isInternal to false when specified', async () => {
      stubFindOne();
      const noteDto = { content: 'Nota publica', isInternal: false };
      const createdNote = {
        id: 'note-2',
        caseId: 'case-1',
        authorId: 'lawyer-1',
        content: 'Nota publica',
        isInternal: false,
        author: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
      };
      mockPrismaCaseNote.create.mockResolvedValue(createdNote);
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.addNote('case-1', noteDto, 'lawyer-1');

      expect(mockPrismaCaseNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isInternal: false }),
        }),
      );
    });
  });

  // ─── createTask ─────────────────────────────────────────────────

  describe('createTask', () => {
    it('should create a task with assignee', async () => {
      stubFindOne();
      const taskDto = {
        title: 'Preparar escrito',
        description: 'Documento legal',
        assigneeId: 'lawyer-1',
        priority: 'HIGH' as any,
      };
      const createdTask = {
        id: 'task-1',
        caseId: 'case-1',
        ...taskDto,
        isCompleted: false,
        completedAt: null,
        assignee: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
      };
      mockPrismaCaseTask.create.mockResolvedValue(createdTask);
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.createTask('case-1', taskDto, 'admin-1');

      expect(result).toEqual(createdTask);
      expect(mockPrismaCaseTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            title: 'Preparar escrito',
            assigneeId: 'lawyer-1',
          }),
        }),
      );
    });
  });

  // ─── completeTask ───────────────────────────────────────────────

  describe('completeTask', () => {
    it('should mark task as complete and create timeline entry', async () => {
      const existingTask = {
        id: 'task-1',
        caseId: 'case-1',
        title: 'Preparar escrito',
        isCompleted: false,
      };
      mockPrismaCaseTask.findFirst.mockResolvedValue(existingTask);
      mockPrismaCaseTask.update.mockResolvedValue({
        ...existingTask,
        isCompleted: true,
        completedAt: NOW,
      });
      mockPrismaCaseTimeline.create.mockResolvedValue({});

      const result = await service.completeTask('case-1', 'task-1', 'admin-1');

      expect(result.isCompleted).toBe(true);
      expect(mockPrismaCaseTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({ isCompleted: true, completedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            eventType: 'TASK_COMPLETED',
          }),
        }),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockPrismaCaseTask.findFirst.mockResolvedValue(null);

      await expect(service.completeTask('case-1', 'nonexistent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── assertCaseAccess ───────────────────────────────────────────

  describe('assertCaseAccess', () => {
    it('should allow SUPER_ADMIN without checking assignment', async () => {
      await expect(
        service.assertCaseAccess('case-1', 'admin-1', UserRole.SUPER_ADMIN),
      ).resolves.toBeUndefined();

      expect(mockPrismaCaseAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('should allow ADMIN without checking assignment', async () => {
      await expect(
        service.assertCaseAccess('case-1', 'admin-1', UserRole.ADMIN),
      ).resolves.toBeUndefined();

      expect(mockPrismaCaseAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('should allow assigned user', async () => {
      mockPrismaCaseAssignment.findFirst.mockResolvedValue({
        id: 'asgn-1',
        caseId: 'case-1',
        userId: 'lawyer-1',
        role: CaseAssignmentRole.LEAD_ATTORNEY,
      });

      await expect(
        service.assertCaseAccess('case-1', 'lawyer-1', UserRole.LAWYER),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException for non-assigned user', async () => {
      mockPrismaCaseAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.assertCaseAccess('case-1', 'random-user', UserRole.LAWYER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
