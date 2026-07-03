import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PortalCasesService } from '../portal-cases.service';
import { PrismaService } from '../../../core/database/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockClientProfile = { id: 'cp-1', userId: 'client-1' };

const mockCaseSummary = {
  id: 'case-1',
  caseNumber: 'CORP-2026-00001',
  title: 'Juicio Mercantil',
  description: 'Desc',
  type: 'CIVIL',
  status: 'ACTIVE',
  priority: 'MEDIUM',
  court: 'Juzgado 5to',
  courtFileNumber: 'EXP-001',
  startDate: NOW,
  closeDate: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockCaseDetail = {
  ...mockCaseSummary,
  legalArea: 'Mercantil',
  parties: [{ id: 'p-1', name: 'Juan', role: 'PLAINTIFF' }],
};

const mockTimelineEntry = {
  id: 'tl-1',
  caseId: 'case-1',
  eventType: 'CASE_CREATED',
  title: 'Case created',
  isPublic: true,
  createdAt: NOW,
};

const mockNote = {
  id: 'note-1',
  content: 'Public note',
  isInternal: false,
  createdAt: NOW,
  updatedAt: NOW,
  author: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
};

const mockCaseDocument = {
  id: 'cd-1',
  addedAt: NOW,
  document: {
    id: 'doc-1',
    title: 'Contract',
    type: 'CONTRACT',
    fileName: 'contract.pdf',
    fileUrl: 'files/contract.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    isConfidential: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
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

describe('PortalCasesService', () => {
  let service: PortalCasesService;

  const mockPrismaClientProfile = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();
  const mockPrismaCaseNote = createMockModel();
  const mockPrismaCaseDocument = createMockModel();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalCasesService,
        {
          provide: PrismaService,
          useValue: {
            get clientProfile() { return mockPrismaClientProfile; },
            get case() { return mockPrismaCase; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
            get caseNote() { return mockPrismaCaseNote; },
            get caseDocument() { return mockPrismaCaseDocument; },
          },
        },
      ],
    }).compile();

    service = module.get<PortalCasesService>(PortalCasesService);
  });

  // Helper: stub assertClientCaseAccess to succeed
  function stubCaseAccess() {
    // assertClientCaseAccess calls clientProfile.findUnique then case.findUnique
    mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
    mockPrismaCase.findUnique.mockResolvedValue({ clientProfileId: 'cp-1' });
  }

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return only cases belonging to the client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([mockCaseSummary]);
      mockPrismaCase.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'client-1');

      expect(result.data).toEqual([mockCaseSummary]);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientProfileId: 'cp-1' }),
        }),
      );
    });

    it('should apply status and type filters', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([]);
      mockPrismaCase.count.mockResolvedValue(0);

      await service.findAll({ status: 'ACTIVE', type: 'CIVIL' } as any, 'client-1');

      expect(mockPrismaCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientProfileId: 'cp-1',
            status: 'ACTIVE',
            type: 'CIVIL',
          }),
        }),
      );
    });

    it('should throw NotFoundException when client has no profile', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      await expect(service.findAll({} as any, 'no-profile')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty list when client has profile but no cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([]);
      mockPrismaCase.count.mockResolvedValue(0);

      const result = await service.findAll({} as any, 'client-1');

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return case details when client owns the case', async () => {
      stubCaseAccess();
      // The second findUnique call returns the full case detail
      mockPrismaCase.findUnique
        .mockResolvedValueOnce({ clientProfileId: 'cp-1' }) // access check
        .mockResolvedValueOnce(mockCaseDetail); // actual findOne

      const result = await service.findOne('case-1', 'client-1');

      expect(result).toEqual(mockCaseDetail);
    });

    it('should throw NotFoundException when case belongs to another client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findUnique.mockResolvedValue({ clientProfileId: 'cp-other' });

      await expect(service.findOne('case-1', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not expose assignments, tasks, or timeEntries in select', async () => {
      stubCaseAccess();
      mockPrismaCase.findUnique
        .mockResolvedValueOnce({ clientProfileId: 'cp-1' })
        .mockResolvedValueOnce(mockCaseDetail);

      await service.findOne('case-1', 'client-1');

      const selectArg = mockPrismaCase.findUnique.mock.calls[1][0].select;
      expect(selectArg.assignments).toBeUndefined();
      expect(selectArg.tasks).toBeUndefined();
      expect(selectArg.timeEntries).toBeUndefined();
    });
  });

  // ─── getTimeline ──────────────────────────────────────────────

  describe('getTimeline', () => {
    it('should only return public timeline entries (isPublic=true)', async () => {
      stubCaseAccess();
      mockPrismaCaseTimeline.findMany.mockResolvedValue([mockTimelineEntry]);
      mockPrismaCaseTimeline.count.mockResolvedValue(1);

      const result = await service.getTimeline('case-1', 'client-1', {} as any);

      expect(result.data).toEqual([mockTimelineEntry]);
      expect(mockPrismaCaseTimeline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ caseId: 'case-1', isPublic: true }),
        }),
      );
    });
  });

  // ─── getNotes ─────────────────────────────────────────────────

  describe('getNotes', () => {
    it('should only return non-internal notes (isInternal=false)', async () => {
      stubCaseAccess();
      mockPrismaCaseNote.findMany.mockResolvedValue([mockNote]);
      mockPrismaCaseNote.count.mockResolvedValue(1);

      const result = await service.getNotes('case-1', 'client-1', {} as any);

      expect(result.data).toEqual([mockNote]);
      expect(mockPrismaCaseNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseId: 'case-1',
            isInternal: false,
            deletedAt: null,
          }),
        }),
      );
    });
  });

  // ─── getDocuments ─────────────────────────────────────────────

  describe('getDocuments', () => {
    it('should only return non-confidential documents', async () => {
      stubCaseAccess();
      mockPrismaCaseDocument.findMany.mockResolvedValue([mockCaseDocument]);
      mockPrismaCaseDocument.count.mockResolvedValue(1);

      const result = await service.getDocuments('case-1', 'client-1', {} as any);

      expect(result.data).toEqual([mockCaseDocument]);
      expect(mockPrismaCaseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseId: 'case-1',
            document: expect.objectContaining({
              isConfidential: false,
              deletedAt: null,
            }),
          }),
        }),
      );
    });
  });
});
