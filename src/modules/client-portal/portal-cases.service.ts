import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PortalCaseQueryDto } from './dto/portal-case-query.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class PortalCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PortalCaseQueryDto, userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });

    if (!clientProfile) {
      throw new NotFoundException('Client profile not found');
    }

    const where: Prisma.CaseWhereInput = {
      clientProfileId: clientProfile.id,
    };

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { caseNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          description: true,
          type: true,
          status: true,
          priority: true,
          court: true,
          courtFileNumber: true,
          startDate: true,
          closeDate: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.case.count({ where }),
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

  async findOne(caseId: string, userId: string) {
    await this.assertClientCaseAccess(caseId, userId);

    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        description: true,
        type: true,
        status: true,
        priority: true,
        legalArea: true,
        court: true,
        courtFileNumber: true,
        startDate: true,
        closeDate: true,
        parties: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return caseRecord;
  }

  async getTimeline(caseId: string, userId: string, query: PaginationQueryDto) {
    await this.assertClientCaseAccess(caseId, userId);

    const where: Prisma.CaseTimelineWhereInput = {
      caseId,
      isPublic: true,
    };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.caseTimeline.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.caseTimeline.count({ where }),
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

  async getNotes(caseId: string, userId: string, query: PaginationQueryDto) {
    await this.assertClientCaseAccess(caseId, userId);

    const where: Prisma.CaseNoteWhereInput = {
      caseId,
      isInternal: false,
      deletedAt: null,
    };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.caseNote.findMany({
        where,
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.caseNote.count({ where }),
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

  async getDocuments(
    caseId: string,
    userId: string,
    query: PaginationQueryDto,
  ) {
    await this.assertClientCaseAccess(caseId, userId);

    const where: Prisma.CaseDocumentWhereInput = {
      caseId,
      document: {
        isConfidential: false,
        deletedAt: null,
      },
    };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.caseDocument.findMany({
        where,
        select: {
          id: true,
          addedAt: true,
          document: {
            select: {
              id: true,
              title: true,
              type: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { addedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.caseDocument.count({ where }),
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

  private async assertClientCaseAccess(
    caseId: string,
    userId: string,
  ): Promise<void> {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });

    if (!clientProfile) {
      throw new NotFoundException('Client profile not found');
    }

    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { clientProfileId: true },
    });

    if (!caseRecord || caseRecord.clientProfileId !== clientProfile.id) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
  }
}
