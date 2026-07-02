import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DocumentService } from '../document.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { StorageService } from '../../../services/storage/storage.service';
import { UploadedFile } from '../../../common/interfaces/uploaded-file.interface';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '../../../common/constants/app.constants';

// Mock uuid for deterministic keys
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

describe('DocumentService', () => {
  let service: DocumentService;

  // ── Prisma model mocks ───────────────────────────────────────

  const mockDocumentModel = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };

  const mockCaseDocumentModel = {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  };

  const mockDocumentVersionModel = {
    create: jest.fn(),
    findMany: jest.fn(),
  };

  const mockCaseTimelineModel = {
    create: jest.fn(),
  };

  const mockCaseAssignmentModel = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    get document() { return mockDocumentModel; },
    get caseDocument() { return mockCaseDocumentModel; },
    get documentVersion() { return mockDocumentVersionModel; },
    get caseTimeline() { return mockCaseTimelineModel; },
    get caseAssignment() { return mockCaseAssignmentModel; },
  };

  const mockAuditService = { log: jest.fn() };

  const mockStorageService = {
    upload: jest.fn(),
    getPresignedUrl: jest.fn(),
    delete: jest.fn(),
  };

  // ── Shared fixtures ──────────────────────────────────────────

  const userId = 'user-1';

  const validFile: UploadedFile = {
    fieldname: 'file',
    originalname: 'contract.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('pdf-content'),
  };

  const mockDocument = {
    id: 'doc-1',
    title: 'Test Document',
    type: DocumentType.CONTRACT,
    fileName: 'contract.pdf',
    fileUrl: 'documents/2026/07/mock-uuid-contract.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedById: userId,
    isConfidential: false,
    tags: [],
    currentVersion: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDocumentWithRelations = {
    ...mockDocument,
    uploadedBy: {
      id: userId,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
    },
    caseDocuments: [],
    _count: { versions: 0 },
  };

  // ── Module setup ─────────────────────────────────────────────

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuditService.log.mockResolvedValue(undefined);
    mockStorageService.upload.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
  });

  // ─── upload ──────────────────────────────────────────────────

  describe('upload', () => {
    const uploadDto = {
      title: 'Contract Draft',
      type: DocumentType.CONTRACT,
    };

    it('should upload file successfully', async () => {
      mockDocumentModel.create.mockResolvedValue(mockDocument);

      const result = await service.upload(validFile, uploadDto, userId);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        validFile,
        expect.stringContaining('mock-uuid-contract.pdf'),
      );
      expect(mockDocumentModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Contract Draft',
          type: DocumentType.CONTRACT,
          fileName: 'contract.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          uploadedById: userId,
          currentVersion: 1,
        }),
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'CREATE',
          entityType: 'Document',
          entityId: mockDocument.id,
        }),
      );
      expect(result).toEqual(mockDocument);
    });

    it('should throw BadRequestException on invalid mime type', async () => {
      const invalidFile: UploadedFile = {
        ...validFile,
        mimetype: 'application/x-executable',
      };

      await expect(
        service.upload(invalidFile, uploadDto, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDocumentModel.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on file too large', async () => {
      const largeFile: UploadedFile = {
        ...validFile,
        size: MAX_FILE_SIZE + 1,
      };

      await expect(
        service.upload(largeFile, uploadDto, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should link document to case when caseId is provided', async () => {
      mockDocumentModel.create.mockResolvedValue(mockDocument);
      mockCaseDocumentModel.create.mockResolvedValue({
        id: 'cd-1',
        caseId: 'case-1',
        documentId: mockDocument.id,
      });

      const dtoWithCase = { ...uploadDto, caseId: 'case-1' };

      await service.upload(validFile, dtoWithCase, userId);

      expect(mockCaseDocumentModel.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-1',
          documentId: mockDocument.id,
        },
      });
    });
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated documents', async () => {
      const docs = [mockDocument];
      mockDocumentModel.findMany.mockResolvedValue(docs);
      mockDocumentModel.count.mockResolvedValue(1);

      const result = await service.findAll({ limit: 20, offset: 0 } as any);

      expect(result.data).toEqual(docs);
      expect(result.meta).toEqual({
        total: 1,
        limit: 20,
        offset: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      expect(mockDocumentModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          where: { deletedAt: null },
        }),
      );
    });

    it('should filter by type and caseId', async () => {
      mockDocumentModel.findMany.mockResolvedValue([]);
      mockDocumentModel.count.mockResolvedValue(0);

      await service.findAll({
        type: DocumentType.CONTRACT,
        caseId: 'case-1',
      } as any);

      expect(mockDocumentModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: DocumentType.CONTRACT,
            caseDocuments: { some: { caseId: 'case-1' } },
          }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return document with relations', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);

      const result = await service.findOne('doc-1');

      expect(result).toEqual(mockDocumentWithRelations);
      expect(mockDocumentModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', deletedAt: null },
        include: expect.objectContaining({
          uploadedBy: expect.any(Object),
          caseDocuments: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('should update document metadata', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);

      const updatedDoc = { ...mockDocument, title: 'Updated Title' };
      mockDocumentModel.update.mockResolvedValue(updatedDoc);

      const result = await service.update('doc-1', {
        title: 'Updated Title',
        tags: ['important'],
      });

      expect(mockDocumentModel.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          title: 'Updated Title',
          tags: ['important'],
        }),
      });
      expect(result.title).toBe('Updated Title');
    });
  });

  // ─── remove ──────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete document and log audit', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockDocumentModel.update.mockResolvedValue({
        ...mockDocument,
        deletedAt: new Date(),
      });

      await service.remove('doc-1', userId);

      expect(mockDocumentModel.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'DELETE',
          entityType: 'Document',
          entityId: 'doc-1',
        }),
      );
    });
  });

  // ─── getDownloadUrl ──────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('should call storageService.getPresignedUrl and return url with metadata', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockStorageService.getPresignedUrl.mockResolvedValue(
        'https://storage.example.com/signed-url',
      );

      const result = await service.getDownloadUrl('doc-1');

      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith(
        mockDocumentWithRelations.fileUrl,
      );
      expect(result).toEqual({
        url: 'https://storage.example.com/signed-url',
        fileName: mockDocumentWithRelations.fileName,
        mimeType: mockDocumentWithRelations.mimeType,
      });
    });
  });

  // ─── uploadNewVersion ────────────────────────────────────────

  describe('uploadNewVersion', () => {
    it('should increment version number and create DocumentVersion record', async () => {
      const docWithVersion = { ...mockDocumentWithRelations, currentVersion: 2 };
      mockDocumentModel.findFirst.mockResolvedValue(docWithVersion);

      const newVersion = {
        id: 'ver-1',
        documentId: 'doc-1',
        versionNumber: 3,
        fileUrl: 'documents/2026/07/mock-uuid-contract.pdf',
        fileSize: 1024,
        changeDescription: 'Updated terms',
        createdById: userId,
      };
      mockDocumentVersionModel.create.mockResolvedValue(newVersion);
      mockDocumentModel.update.mockResolvedValue({
        ...docWithVersion,
        currentVersion: 3,
      });

      const result = await service.uploadNewVersion(
        'doc-1',
        validFile,
        'Updated terms',
        userId,
      );

      expect(mockDocumentVersionModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          versionNumber: 3,
          changeDescription: 'Updated terms',
          createdById: userId,
        }),
      });
      expect(mockDocumentModel.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          currentVersion: 3,
          fileName: 'contract.pdf',
          mimeType: 'application/pdf',
        }),
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'UPDATE',
          entityType: 'Document',
          entityId: 'doc-1',
          newValue: { version: 3, changeDescription: 'Updated terms' },
        }),
      );
      expect(result).toEqual(newVersion);
    });
  });

  // ─── linkToCase ──────────────────────────────────────────────

  describe('linkToCase', () => {
    it('should create CaseDocument entry', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockCaseDocumentModel.findFirst.mockResolvedValue(null);
      mockCaseTimelineModel.create.mockResolvedValue({});
      const caseDoc = {
        id: 'cd-1',
        caseId: 'case-1',
        documentId: 'doc-1',
      };
      mockCaseDocumentModel.create.mockResolvedValue(caseDoc);

      const result = await service.linkToCase('doc-1', 'case-1');

      expect(mockCaseDocumentModel.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', documentId: 'doc-1' },
      });
      expect(mockCaseTimelineModel.create).toHaveBeenCalled();
      expect(result).toEqual(caseDoc);
    });

    it('should throw BadRequestException if already linked', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockCaseDocumentModel.findFirst.mockResolvedValue({
        id: 'cd-1',
        caseId: 'case-1',
        documentId: 'doc-1',
      });

      await expect(
        service.linkToCase('doc-1', 'case-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── unlinkFromCase ──────────────────────────────────────────

  describe('unlinkFromCase', () => {
    it('should delete CaseDocument entry', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockCaseDocumentModel.findFirst.mockResolvedValue({
        id: 'cd-1',
        caseId: 'case-1',
        documentId: 'doc-1',
      });
      mockCaseDocumentModel.delete.mockResolvedValue(undefined);

      await service.unlinkFromCase('doc-1', 'case-1');

      expect(mockCaseDocumentModel.delete).toHaveBeenCalledWith({
        where: { id: 'cd-1' },
      });
    });

    it('should throw NotFoundException if link does not exist', async () => {
      mockDocumentModel.findFirst.mockResolvedValue(mockDocumentWithRelations);
      mockCaseDocumentModel.findFirst.mockResolvedValue(null);

      await expect(
        service.unlinkFromCase('doc-1', 'case-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
