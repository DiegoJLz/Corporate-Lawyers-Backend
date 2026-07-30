import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Prisma, DocumentType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { StorageService } from '../../services/storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '../../common/constants/app.constants';
import { UploadedFile } from '../../common/interfaces/uploaded-file.interface';
import { WebhookDispatcherService } from '../../modules/integrations/webhooks/webhook-dispatcher.service';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  // ─── Upload ──────────────────────────────────────────────────

  async upload(
    file: UploadedFile,
    dto: UploadDocumentDto,
    uploadedById: string,
  ) {
    this.validateFile(file);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `documents/${year}/${month}/${uuidv4()}-${file.originalname}`;

    await this.storageService.upload(file, key);

    const document = await this.prisma.document.create({
      data: {
        title: dto.title,
        type: dto.type ?? DocumentType.OTHER,
        fileName: file.originalname,
        fileUrl: key,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById,
        isConfidential: dto.isConfidential ?? false,
        tags: dto.tags ?? [],
        currentVersion: 1,
      },
    });

    if (dto.caseId) {
      await this.prisma.caseDocument.create({
        data: {
          caseId: dto.caseId,
          documentId: document.id,
        },
      });
    }

    await this.auditService.log({
      userId: uploadedById,
      action: 'CREATE',
      entityType: 'Document',
      entityId: document.id,
    });

    await this.webhookDispatcher.dispatch('document.uploaded', { documentId: document.id, title: dto.title, type: dto.type || 'OTHER', caseId: dto.caseId });

    return document;
  }

  // ─── Find All ────────────────────────────────────────────────

  async findAll(query: DocumentQueryDto, userId?: string, userRole?: string) {
    const where: Prisma.DocumentWhereInput = { deletedAt: null };
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    // C3 FIX: Non-admins can only see non-confidential docs or their own
    if (!isAdmin && userId) {
      where.OR = [
        { isConfidential: false },
        { isConfidential: true, uploadedById: userId },
      ];
    }

    if (query.type) where.type = query.type;
    if (query.uploadedById) where.uploadedById = query.uploadedById;
    if (query.isConfidential !== undefined && isAdmin) {
      where.isConfidential = query.isConfidential === 'true';
    }
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (query.caseId) {
      where.caseDocuments = {
        some: { caseId: query.caseId },
      };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          caseDocuments: {
            include: { case: { select: { id: true, caseNumber: true, title: true } } },
            take: 3,
          },
          _count: {
            select: { caseDocuments: true, versions: true },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

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

  // ─── Find One ────────────────────────────────────────────────

  async findOne(id: string, userId?: string, userRole?: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        caseDocuments: {
          include: {
            case: {
              select: { id: true, caseNumber: true, title: true },
            },
          },
        },
        _count: {
          select: { versions: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // C3+C4 FIX: Enforce confidential + case-assignment access
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
    if (!isAdmin && userId) {
      if (document.isConfidential && document.uploadedById !== userId) {
        throw new NotFoundException(`Document with ID ${id} not found`);
      }

      // C4: If linked to cases, verify user is assigned to at least one
      if (document.caseDocuments.length > 0) {
        const caseIds = document.caseDocuments.map((cd: any) => cd.case?.id ?? cd.caseId);
        const assignment = await this.prisma.caseAssignment.findFirst({
          where: { caseId: { in: caseIds }, userId, removedAt: null },
        });
        if (!assignment) {
          throw new NotFoundException(`Document with ID ${id} not found`);
        }
      }
    }

    return document;
  }

  // ─── Update ──────────────────────────────────────────────────

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);

    const document = await this.prisma.document.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        isConfidential: dto.isConfidential,
        tags: dto.tags,
      },
    });

    return document;
  }

  // ─── Remove (Soft Delete) ───────────────────────────────────

  async remove(id: string, performedBy: string) {
    await this.findOne(id);

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      userId: performedBy,
      action: 'DELETE',
      entityType: 'Document',
      entityId: id,
    });
  }

  // ─── Download URL ───────────────────────────────────────────

  async getDownloadUrl(id: string) {
    const document = await this.findOne(id);

    const url = await this.storageService.getPresignedUrl(document.fileUrl);

    return { url, fileName: document.fileName, mimeType: document.mimeType };
  }

  // ─── Versions ───────────────────────────────────────────────

  async getVersions(id: string) {
    await this.findOne(id);

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { versionNumber: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return versions;
  }

  // A2 FIX: Download specific version
  async downloadVersion(documentId: string, versionNumber: number) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId, versionNumber },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for document ${documentId}`);
    }

    const url = await this.storageService.getPresignedUrl(version.fileUrl);
    return { url, versionNumber: version.versionNumber, fileSize: version.fileSize };
  }

  async uploadNewVersion(
    id: string,
    file: UploadedFile,
    changeDescription: string | undefined,
    userId: string,
  ) {
    this.validateFile(file);

    const document = await this.findOne(id);
    const newVersionNumber = document.currentVersion + 1;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `documents/${year}/${month}/${uuidv4()}-${file.originalname}`;

    await this.storageService.upload(file, key);

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        versionNumber: newVersionNumber,
        fileUrl: key,
        fileSize: file.size,
        changeDescription,
        createdById: userId,
      },
    });

    await this.prisma.document.update({
      where: { id },
      data: {
        currentVersion: newVersionNumber,
        fileUrl: key,
        fileSize: file.size,
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'Document',
      entityId: id,
      newValue: { version: newVersionNumber, changeDescription },
    });

    return version;
  }

  // ─── Case Linking ──────────────────────────────────────────

  async linkToCase(documentId: string, caseId: string, userId?: string) {
    await this.findOne(documentId);

    const existing = await this.prisma.caseDocument.findFirst({
      where: { documentId, caseId },
    });

    if (existing) {
      throw new BadRequestException(
        'Document is already linked to this case',
      );
    }

    const caseDocument = await this.prisma.caseDocument.create({
      data: { caseId, documentId },
    });

    // M1 FIX: Create DOCUMENT_LINKED timeline entry
    const doc = await this.prisma.document.findFirst({ where: { id: documentId } });
    await this.prisma.caseTimeline.create({
      data: {
        caseId,
        eventType: 'DOCUMENT_LINKED',
        title: `Document linked: ${doc?.title ?? documentId}`,
        isPublic: true,
        metadata: { documentId, documentTitle: doc?.title, linkedBy: userId } as any,
      },
    });

    return caseDocument;
  }

  async unlinkFromCase(documentId: string, caseId: string) {
    await this.findOne(documentId);

    const link = await this.prisma.caseDocument.findFirst({
      where: { documentId, caseId },
    });

    if (!link) {
      throw new NotFoundException(
        'Document is not linked to this case',
      );
    }

    await this.prisma.caseDocument.delete({
      where: { id: link.id },
    });
  }

  // ─── Full-Text Search ──────────────────────────────────────

  async search(query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.trim().replace(/[^a-zA-Z0-9\s]/g, '');

    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        type: string;
        file_name: string;
        mime_type: string;
        is_confidential: boolean;
        created_at: Date;
        uploaded_by_id: string;
      }>
    >`
      SELECT id, title, type, file_name, mime_type, is_confidential, created_at, uploaded_by_id
      FROM documents
      WHERE deleted_at IS NULL
        AND to_tsvector('english', title) @@ plainto_tsquery('english', ${searchTerm})
      ORDER BY ts_rank(to_tsvector('english', title), plainto_tsquery('english', ${searchTerm})) DESC
      LIMIT 50
    `;

    return results;
  }

  // ─── Private Helpers ───────────────────────────────────────

  private validateFile(file: UploadedFile): void {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }
  }
}
