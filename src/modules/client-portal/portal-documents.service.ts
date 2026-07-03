import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { StorageService } from '../../services/storage/storage.service';
import { PortalDocumentQueryDto } from './dto/portal-document-query.dto';

@Injectable()
export class PortalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  // ─── Find All ────────────────────────────────────────────────

  async findAll(query: PortalDocumentQueryDto, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return {
        data: [],
        meta: { total: 0, limit: query.limit, offset: query.offset, hasNextPage: false, hasPreviousPage: false },
      };
    }

    // Get all case IDs for this client
    const cases = await this.prisma.case.findMany({
      where: { clientProfileId: clientProfile.id },
      select: { id: true },
    });
    const caseIds = cases.map((c) => c.id);

    if (caseIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, limit: query.limit, offset: query.offset, hasNextPage: false, hasPreviousPage: false },
      };
    }

    // If caseId is provided, verify it belongs to this client
    if (query.caseId) {
      if (!caseIds.includes(query.caseId)) {
        throw new ForbiddenException('You do not have access to this case');
      }
    }

    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      isConfidential: false,
      caseDocuments: {
        some: { caseId: query.caseId ? query.caseId : { in: caseIds } },
      },
    };

    if (query.type) where.type = query.type;
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
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
            select: { id: true, firstName: true, lastName: true },
          },
          caseDocuments: {
            include: {
              case: { select: { id: true, caseNumber: true, title: true } },
            },
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

  async findOne(documentId: string, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    const caseIds = (
      await this.prisma.case.findMany({
        where: { clientProfileId: clientProfile.id },
        select: { id: true },
      })
    ).map((c) => c.id);

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        isConfidential: false,
        caseDocuments: {
          some: { caseId: { in: caseIds } },
        },
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        caseDocuments: {
          include: {
            case: { select: { id: true, caseNumber: true, title: true } },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    return document;
  }

  // ─── Download ────────────────────────────────────────────────

  async download(documentId: string, userId: string) {
    const document = await this.findOne(documentId, userId);

    const url = await this.storageService.getPresignedUrl(document.fileUrl);

    await this.auditService.log({
      userId,
      action: 'DOWNLOAD',
      entityType: 'Document',
      entityId: documentId,
    });

    return { url, fileName: document.fileName, mimeType: document.mimeType };
  }
}
