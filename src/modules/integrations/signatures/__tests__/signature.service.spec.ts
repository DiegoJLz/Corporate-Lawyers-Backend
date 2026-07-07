import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhookDispatcherService } from '../../webhooks/webhook-dispatcher.service';
import { ConfigService } from '@nestjs/config';
import { SignatureStatus, NotificationType } from '@prisma/client';
import { SignatureService } from '../signature.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { StorageService } from '../../../../services/storage/storage.service';
import { AuditService } from '../../../../services/audit/audit.service';
import { NotificationService } from '../../../../services/notification/notification.service';

// Mock uuid for deterministic keys
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

// ─── Fixtures ───────────────────────────────────────────────────────

const mockDocument = {
  id: 'doc-1',
  title: 'Contract Draft',
  fileName: 'contract.pdf',
  fileUrl: 'documents/2026/07/contract.pdf',
  currentVersion: 1,
  uploadedById: 'uploader-1',
  deletedAt: null,
  uploadedBy: {
    id: 'uploader-1',
    firstName: 'Ana',
    lastName: 'Garcia',
    email: 'ana@firm.com',
  },
};

const createRequestDto = {
  documentId: 'doc-1',
  signers: [
    { name: 'Carlos Lopez', email: 'carlos@acme.com', order: 1 },
    { name: 'Maria Torres', email: 'maria@acme.com', order: 2 },
  ],
  message: 'Please sign this contract',
};

const signatureProviderResult = {
  externalId: 'ext-sig-001',
  signingUrl: 'https://signatures.example.com/sign/ext-sig-001',
  status: 'pending',
};

const mockSignatureRecord = {
  id: 'sig-1',
  documentId: 'doc-1',
  signerName: 'Carlos Lopez',
  signerEmail: 'carlos@acme.com',
  status: SignatureStatus.PENDING,
  signatureProvider: 'docusign',
  externalId: 'ext-sig-001',
  signedAt: null,
  createdAt: new Date('2026-07-01T12:00:00Z'),
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('SignatureService', () => {
  let service: SignatureService;

  const mockPrismaDocument = createMockModel();
  const mockPrismaDocumentSignature = createMockModel();
  const mockPrismaDocumentVersion = createMockModel();
  const mockPrismaUser = createMockModel();

  const mockSignatureProvider = {
    createRequest: jest.fn(),
    getStatus: jest.fn(),
    downloadSigned: jest.fn(),
    cancelRequest: jest.fn(),
  };

  const mockStorageService = {
    upload: jest.fn(),
    getPresignedUrl: jest.fn(),
    delete: jest.fn(),
  };

  const mockAuditService = { log: jest.fn() };
  const mockNotificationService = { send: jest.fn() };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      const config: Record<string, string> = {
        API_URL: 'http://localhost:3000',
      };
      return config[key] ?? defaultVal;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureService,
        {
          provide: PrismaService,
          useValue: {
            get document() { return mockPrismaDocument; },
            get documentSignature() { return mockPrismaDocumentSignature; },
            get documentVersion() { return mockPrismaDocumentVersion; },
            get user() { return mockPrismaUser; },
          },
        },
        { provide: StorageService, useValue: mockStorageService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'SIGNATURE_PROVIDER', useValue: mockSignatureProvider },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn() } },
      ],
    }).compile();

    service = module.get<SignatureService>(SignatureService);
  });

  // ─── createRequest ────────────────────────────────────────────

  describe('createRequest', () => {
    function setupCreateMocks() {
      mockPrismaDocument.findFirst.mockResolvedValue(mockDocument);
      mockStorageService.getPresignedUrl.mockResolvedValue('https://s3.example.com/presigned/contract.pdf');
      mockSignatureProvider.createRequest.mockResolvedValue(signatureProviderResult);
      mockPrismaDocumentSignature.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: `sig-${Math.random().toString(36).slice(2, 6)}`,
          ...args.data,
          signedAt: null,
          createdAt: new Date(),
        }),
      );
      mockPrismaUser.findFirst.mockResolvedValue(null); // signers not in system by default
      mockAuditService.log.mockResolvedValue(undefined);
      mockNotificationService.send.mockResolvedValue(undefined);
    }

    it('should create DocumentSignature records for each signer', async () => {
      setupCreateMocks();

      const result = await service.createRequest(createRequestDto, 'user-1');

      expect(mockPrismaDocumentSignature.create).toHaveBeenCalledTimes(2);
      expect(mockPrismaDocumentSignature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'doc-1',
            signerName: 'Carlos Lopez',
            signerEmail: 'carlos@acme.com',
            status: SignatureStatus.PENDING,
            externalId: 'ext-sig-001',
          }),
        }),
      );
      expect(result.externalId).toBe('ext-sig-001');
      expect(result.signatures).toHaveLength(2);
    });

    it('should send notification to signers who are users in the system', async () => {
      setupCreateMocks();
      // First signer is a system user
      mockPrismaUser.findFirst
        .mockResolvedValueOnce({ id: 'system-user-carlos', email: 'carlos@acme.com' })
        .mockResolvedValueOnce(null); // second signer not in system

      await service.createRequest(createRequestDto, 'user-1');

      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system-user-carlos',
          type: NotificationType.EMAIL,
          title: 'Signature Requested',
          body: expect.stringContaining('Contract Draft'),
        }),
      );
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.createRequest(createRequestDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockSignatureProvider.createRequest).not.toHaveBeenCalled();
    });

    it('should create audit log after creating request', async () => {
      setupCreateMocks();

      await service.createRequest(createRequestDto, 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CREATE',
          entityType: 'DocumentSignature',
          entityId: 'doc-1',
          newValue: expect.objectContaining({
            signers: ['carlos@acme.com', 'maria@acme.com'],
            externalId: 'ext-sig-001',
          }),
        }),
      );
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────

  describe('handleWebhook', () => {
    const signedPayload = {
      externalId: 'ext-sig-001',
      status: 'signed',
    };

    const declinedPayload = {
      externalId: 'ext-sig-001',
      status: 'declined',
    };

    const signaturesWithDoc = [
      {
        ...mockSignatureRecord,
        document: {
          id: 'doc-1',
          title: 'Contract Draft',
          fileUrl: 'documents/2026/07/contract.pdf',
          currentVersion: 1,
          uploadedById: 'uploader-1',
        },
      },
    ];

    it('should update status to SIGNED and set signedAt', async () => {
      mockPrismaDocumentSignature.findMany.mockResolvedValue(signaturesWithDoc);
      mockPrismaDocumentSignature.updateMany.mockResolvedValue({ count: 1 });
      mockSignatureProvider.downloadSigned.mockResolvedValue(Buffer.from('signed-pdf'));
      mockStorageService.upload.mockResolvedValue(undefined);
      mockPrismaDocumentVersion.create.mockResolvedValue({});
      mockPrismaDocument.update.mockResolvedValue({});
      mockNotificationService.send.mockResolvedValue(undefined);

      await service.handleWebhook(signedPayload);

      expect(mockPrismaDocumentSignature.updateMany).toHaveBeenCalledWith({
        where: { externalId: 'ext-sig-001' },
        data: expect.objectContaining({
          status: SignatureStatus.SIGNED,
          signedAt: expect.any(Date),
        }),
      });
    });

    it('should download signed doc and create new document version when SIGNED', async () => {
      mockPrismaDocumentSignature.findMany.mockResolvedValue(signaturesWithDoc);
      mockPrismaDocumentSignature.updateMany.mockResolvedValue({ count: 1 });
      mockSignatureProvider.downloadSigned.mockResolvedValue(Buffer.from('signed-pdf'));
      mockStorageService.upload.mockResolvedValue(undefined);
      mockPrismaDocumentVersion.create.mockResolvedValue({});
      mockPrismaDocument.update.mockResolvedValue({});
      mockNotificationService.send.mockResolvedValue(undefined);

      await service.handleWebhook(signedPayload);

      expect(mockSignatureProvider.downloadSigned).toHaveBeenCalledWith('ext-sig-001');
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          mimetype: 'application/pdf',
          originalname: 'Contract Draft-signed.pdf',
        }),
        expect.stringContaining('mock-uuid-signed.pdf'),
      );
      expect(mockPrismaDocumentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'doc-1',
            versionNumber: 2,
            changeDescription: 'Digitally signed document',
          }),
        }),
      );
    });

    it('should update status to DECLINED without downloading', async () => {
      mockPrismaDocumentSignature.findMany.mockResolvedValue(signaturesWithDoc);
      mockPrismaDocumentSignature.updateMany.mockResolvedValue({ count: 1 });

      await service.handleWebhook(declinedPayload);

      expect(mockPrismaDocumentSignature.updateMany).toHaveBeenCalledWith({
        where: { externalId: 'ext-sig-001' },
        data: expect.objectContaining({
          status: SignatureStatus.DECLINED,
        }),
      });
      expect(mockSignatureProvider.downloadSigned).not.toHaveBeenCalled();
    });

    it('should notify document uploader when document is signed', async () => {
      mockPrismaDocumentSignature.findMany.mockResolvedValue(signaturesWithDoc);
      mockPrismaDocumentSignature.updateMany.mockResolvedValue({ count: 1 });
      mockSignatureProvider.downloadSigned.mockResolvedValue(Buffer.from('signed-pdf'));
      mockStorageService.upload.mockResolvedValue(undefined);
      mockPrismaDocumentVersion.create.mockResolvedValue({});
      mockPrismaDocument.update.mockResolvedValue({});
      mockNotificationService.send.mockResolvedValue(undefined);

      await service.handleWebhook(signedPayload);

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'uploader-1',
          type: NotificationType.IN_APP,
          title: 'Document Signed',
          body: expect.stringContaining('Contract Draft'),
        }),
      );
    });

    it('should ignore unknown externalId (no signatures found)', async () => {
      mockPrismaDocumentSignature.findMany.mockResolvedValue([]);

      await service.handleWebhook({ externalId: 'unknown-ext', status: 'signed' });

      expect(mockPrismaDocumentSignature.updateMany).not.toHaveBeenCalled();
      expect(mockSignatureProvider.downloadSigned).not.toHaveBeenCalled();
    });

    it('should return early when payload has no externalId', async () => {
      await service.handleWebhook({ status: 'signed' });

      expect(mockPrismaDocumentSignature.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated signatures', async () => {
      const signaturesPage = [mockSignatureRecord];
      mockPrismaDocumentSignature.findMany.mockResolvedValue(signaturesPage);
      mockPrismaDocumentSignature.count.mockResolvedValue(1);

      const result = await service.findAll({ limit: 20, offset: 0 } as any);

      expect(result.data).toEqual(signaturesPage);
      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 1,
          limit: 20,
          offset: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );
    });
  });

  // ─── getDocumentSignatures ────────────────────────────────────

  describe('getDocumentSignatures', () => {
    it('should return all signatures for a given document', async () => {
      mockPrismaDocument.findFirst.mockResolvedValue(mockDocument);
      mockPrismaDocumentSignature.findMany.mockResolvedValue([mockSignatureRecord]);

      const result = await service.getDocumentSignatures('doc-1');

      expect(mockPrismaDocumentSignature.findMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].signerName).toBe('Carlos Lopez');
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.getDocumentSignatures('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
