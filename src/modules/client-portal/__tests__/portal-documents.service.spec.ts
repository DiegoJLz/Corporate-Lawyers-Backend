import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PortalDocumentsService } from '../portal-documents.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { StorageService } from '../../../services/storage/storage.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockClientProfile = { id: 'cp-1' };

const mockCases = [
  { id: 'case-1' },
  { id: 'case-2' },
];

const mockDocument = {
  id: 'doc-1',
  title: 'Contract',
  type: 'CONTRACT',
  fileName: 'contract.pdf',
  fileUrl: 'files/contract.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  isConfidential: false,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  uploadedBy: { id: 'lawyer-1', firstName: 'Ana', lastName: 'Garcia' },
  caseDocuments: [
    { case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Case A' } },
  ],
};

const mockConfidentialDocument = {
  ...mockDocument,
  id: 'doc-confidential',
  isConfidential: true,
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

describe('PortalDocumentsService', () => {
  let service: PortalDocumentsService;

  const mockPrismaClientProfile = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaDocument = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockStorageService = { getPresignedUrl: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalDocumentsService,
        {
          provide: PrismaService,
          useValue: {
            get clientProfile() { return mockPrismaClientProfile; },
            get case() { return mockPrismaCase; },
            get document() { return mockPrismaDocument; },
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    service = module.get<PortalDocumentsService>(PortalDocumentsService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should exclude confidential documents (isConfidential=false in where)', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findMany.mockResolvedValue([mockDocument]);
      mockPrismaDocument.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'client-1');

      expect(result.data).toEqual([mockDocument]);
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isConfidential: false,
            deletedAt: null,
          }),
        }),
      );
    });

    it('should only return documents from cases belonging to the client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findMany.mockResolvedValue([]);
      mockPrismaDocument.count.mockResolvedValue(0);

      await service.findAll({} as any, 'client-1');

      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            caseDocuments: {
              some: { caseId: { in: ['case-1', 'case-2'] } },
            },
          }),
        }),
      );
    });

    it('should return empty data when client has no profile', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      const result = await service.findAll({ limit: 20, offset: 0 } as any, 'client-1');

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty data when client has no cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([]);

      const result = await service.findAll({ limit: 20, offset: 0 } as any, 'client-1');

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should throw ForbiddenException when caseId filter belongs to another client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);

      await expect(
        service.findAll({ caseId: 'case-other' } as any, 'client-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return non-confidential document from client cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findFirst.mockResolvedValue(mockDocument);

      const result = await service.findOne('doc-1', 'client-1');

      expect(result).toEqual(mockDocument);
    });

    it('should throw NotFoundException when document is confidential', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      // findFirst returns null because isConfidential=false is in the where clause
      mockPrismaDocument.findFirst.mockResolvedValue(null);

      await expect(service.findOne('doc-confidential', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when document belongs to another client case', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findFirst.mockResolvedValue(null);

      await expect(service.findOne('doc-other-client', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when client has no profile', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      await expect(service.findOne('doc-1', 'no-profile')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── download ─────────────────────────────────────────────────

  describe('download', () => {
    it('should generate presigned URL for valid document', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findFirst.mockResolvedValue(mockDocument);
      mockStorageService.getPresignedUrl.mockResolvedValue('https://presigned-url.example.com/file');

      const result = await service.download('doc-1', 'client-1');

      expect(result.url).toBe('https://presigned-url.example.com/file');
      expect(result.fileName).toBe('contract.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith('files/contract.pdf');
    });

    it('should log audit entry on download', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue(mockCases);
      mockPrismaDocument.findFirst.mockResolvedValue(mockDocument);
      mockStorageService.getPresignedUrl.mockResolvedValue('https://presigned.url');

      await service.download('doc-1', 'client-1');

      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 'client-1',
        action: 'DOWNLOAD',
        entityType: 'Document',
        entityId: 'doc-1',
      });
    });
  });
});
