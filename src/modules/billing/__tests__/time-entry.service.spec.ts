import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TimeEntryService } from '../time-entry.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { CaseService } from '../../case/case.service';
import { UserRole } from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');
const PAST_DATE = '2026-06-15';
const FUTURE_DATE = '2099-01-01';

const mockLawyerProfile = {
  userId: 'lawyer-1',
  hourlyRate: 2500,
};

const mockCaseData = {
  id: 'case-1',
  caseNumber: 'CORP-2026-00001',
  title: 'Juicio Mercantil',
  status: 'ACTIVE',
  clientProfileId: 'cp-1',
};

const mockTimeEntry = {
  id: 'te-1',
  caseId: 'case-1',
  lawyerId: 'lawyer-1',
  description: 'Revision de contrato',
  hours: 2.5,
  rate: 2500,
  isBillable: true,
  isBilled: false,
  date: new Date(PAST_DATE),
  lawyer: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Juicio Mercantil' },
};

const createDto = {
  caseId: 'case-1',
  description: 'Revision de contrato',
  hours: 2.5,
  date: PAST_DATE,
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

describe('TimeEntryService', () => {
  let service: TimeEntryService;

  const mockPrismaTimeEntry = createMockModel();
  const mockPrismaLawyerProfile = createMockModel();
  const mockPrismaCase = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockCaseService = {
    assertCaseAccess: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeEntryService,
        {
          provide: PrismaService,
          useValue: {
            get timeEntry() { return mockPrismaTimeEntry; },
            get lawyerProfile() { return mockPrismaLawyerProfile; },
            get case() { return mockPrismaCase; },
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: CaseService,
          useValue: mockCaseService,
        },
      ],
    }).compile();

    service = module.get<TimeEntryService>(TimeEntryService);
  });

  // Helper: stub findOne (used internally by update/remove)
  function stubFindOne(data = mockTimeEntry) {
    mockPrismaTimeEntry.findFirst.mockResolvedValue(data);
  }

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a time entry with default rate from lawyer profile', async () => {
      mockCaseService.assertCaseAccess.mockResolvedValue(undefined);
      mockCaseService.findOne.mockResolvedValue(mockCaseData);
      mockPrismaLawyerProfile.findUnique.mockResolvedValue(mockLawyerProfile);
      mockPrismaTimeEntry.create.mockResolvedValue(mockTimeEntry);

      const result = await service.create(createDto, 'lawyer-1', UserRole.LAWYER);

      expect(result).toEqual(mockTimeEntry);
      expect(mockPrismaLawyerProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 'lawyer-1' } });
      expect(mockPrismaTimeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            lawyerId: 'lawyer-1',
            rate: 2500,
            hours: 2.5,
          }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'TimeEntry' }),
      );
    });

    it('should reject future date', async () => {
      mockCaseService.assertCaseAccess.mockResolvedValue(undefined);
      mockCaseService.findOne.mockResolvedValue(mockCaseData);

      await expect(
        service.create({ ...createDto, date: FUTURE_DATE }, 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject closed case', async () => {
      mockCaseService.assertCaseAccess.mockResolvedValue(undefined);
      mockCaseService.findOne.mockResolvedValue({ ...mockCaseData, status: 'CLOSED' });

      await expect(
        service.create(createDto, 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject archived case', async () => {
      mockCaseService.assertCaseAccess.mockResolvedValue(undefined);
      mockCaseService.findOne.mockResolvedValue({ ...mockCaseData, status: 'ARCHIVED' });

      await expect(
        service.create(createDto, 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use provided rate instead of profile rate', async () => {
      mockCaseService.assertCaseAccess.mockResolvedValue(undefined);
      mockCaseService.findOne.mockResolvedValue(mockCaseData);
      mockPrismaTimeEntry.create.mockResolvedValue({ ...mockTimeEntry, rate: 3000 });

      await service.create({ ...createDto, rate: 3000 }, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaLawyerProfile.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaTimeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rate: 3000 }),
        }),
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a time entry', async () => {
      stubFindOne();
      const updatedEntry = { ...mockTimeEntry, description: 'Updated description' };
      mockPrismaTimeEntry.update.mockResolvedValue(updatedEntry);

      const result = await service.update('te-1', { description: 'Updated description' }, 'lawyer-1', UserRole.LAWYER);

      expect(result).toEqual(updatedEntry);
      expect(mockPrismaTimeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'te-1' },
          data: expect.objectContaining({ description: 'Updated description' }),
        }),
      );
    });

    it('should reject update if time entry is billed', async () => {
      stubFindOne({ ...mockTimeEntry, isBilled: true });

      await expect(
        service.update('te-1', { description: 'New' }, 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject update if not owner and not admin', async () => {
      stubFindOne({ ...mockTimeEntry, lawyerId: 'other-lawyer' });

      await expect(
        service.update('te-1', { description: 'New' }, 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete a time entry', async () => {
      stubFindOne();
      mockPrismaTimeEntry.update.mockResolvedValue({});

      await service.remove('te-1', 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaTimeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'te-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'TimeEntry', entityId: 'te-1' }),
      );
    });

    it('should reject delete if billed', async () => {
      stubFindOne({ ...mockTimeEntry, isBilled: true });

      await expect(
        service.remove('te-1', 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject delete if not owner and not admin', async () => {
      stubFindOne({ ...mockTimeEntry, lawyerId: 'other-lawyer' });

      await expect(
        service.remove('te-1', 'lawyer-1', UserRole.LAWYER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const entries = [mockTimeEntry];
      mockPrismaTimeEntry.findMany.mockResolvedValue(entries);
      mockPrismaTimeEntry.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'admin-1', UserRole.ADMIN);

      expect(result.data).toEqual(entries);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0, hasNextPage: false, hasPreviousPage: false }),
      );
    });

    it('should restrict non-admin users to only their own entries', async () => {
      mockPrismaTimeEntry.findMany.mockResolvedValue([]);
      mockPrismaTimeEntry.count.mockResolvedValue(0);

      await service.findAll({} as any, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaTimeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lawyerId: 'lawyer-1' }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a time entry with includes', async () => {
      stubFindOne();

      const result = await service.findOne('te-1');

      expect(result).toEqual(mockTimeEntry);
      expect(mockPrismaTimeEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'te-1' },
          include: expect.objectContaining({
            lawyer: expect.any(Object),
            case: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when entry does not exist', async () => {
      mockPrismaTimeEntry.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSummary ─────────────────────────────────────────────────

  describe('getSummary', () => {
    it('should calculate summary totals correctly', async () => {
      mockPrismaTimeEntry.findMany.mockResolvedValue([
        { hours: 2, rate: 1000, isBilled: true },
        { hours: 3, rate: 1500, isBilled: false },
        { hours: 1, rate: 2000, isBilled: false },
      ]);

      const result = await service.getSummary('case-1');

      expect(result).toEqual({
        totalHours: 6,
        totalAmount: 8500,       // (2*1000) + (3*1500) + (1*2000)
        unbilledHours: 4,        // 3 + 1
        unbilledAmount: 6500,    // (3*1500) + (1*2000)
      });
      expect(mockPrismaTimeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { caseId: 'case-1', isBillable: true },
        }),
      );
    });
  });
});
