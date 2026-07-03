import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { CaseService } from '../case/case.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeEntryQueryDto } from './dto/time-entry-query.dto';
import { Prisma, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class TimeEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly caseService: CaseService,
  ) {}

  async create(dto: CreateTimeEntryDto, lawyerId: string, userRole: string) {
    await this.caseService.assertCaseAccess(dto.caseId, lawyerId, userRole);

    const caseData = await this.caseService.findOne(dto.caseId);
    if (caseData.status === 'CLOSED' || caseData.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot add time entries to a closed or archived case');
    }

    if (new Date(dto.date) > new Date()) {
      throw new BadRequestException('Date cannot be in the future');
    }

    let rate = dto.rate;
    if (rate === undefined) {
      const profile = await this.prisma.lawyerProfile.findUnique({ where: { userId: lawyerId } });
      rate = profile ? Number(profile.hourlyRate) : 0;
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        caseId: dto.caseId,
        lawyerId,
        description: dto.description,
        hours: dto.hours,
        rate,
        isBillable: dto.isBillable ?? true,
        date: new Date(dto.date),
      },
      include: { lawyer: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.auditService.log({ userId: lawyerId, action: 'CREATE', entityType: 'TimeEntry', entityId: entry.id });
    return entry;
  }

  async findAll(query: TimeEntryQueryDto, userId: string, userRole: string) {
    const where: Prisma.TimeEntryWhereInput = {};
    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;

    if (!isAdmin) where.lawyerId = userId;
    if (query.caseId) where.caseId = query.caseId;
    if (query.lawyerId && isAdmin) where.lawyerId = query.lawyerId;
    if (query.isBillable !== undefined) where.isBillable = query.isBillable === 'true';
    if (query.isBilled !== undefined) where.isBilled = query.isBilled === 'true';
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where, orderBy: { [query.sortBy ?? 'date']: query.sortOrder ?? 'desc' },
        take: limit, skip: offset,
        include: {
          lawyer: { select: { id: true, firstName: true, lastName: true } },
          case: { select: { id: true, caseNumber: true, title: true } },
        },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 } };
  }

  async findOne(id: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id },
      include: {
        lawyer: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);
    return entry;
  }

  async update(id: string, dto: UpdateTimeEntryDto, userId: string, userRole: string) {
    const entry = await this.findOne(id);
    if (entry.isBilled) throw new BadRequestException('Cannot modify a billed time entry');

    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
    if (entry.lawyerId !== userId && !isAdmin) throw new ForbiddenException('You can only edit your own time entries');

    if (dto.date && new Date(dto.date) > new Date()) throw new BadRequestException('Date cannot be in the future');

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        description: dto.description,
        hours: dto.hours,
        rate: dto.rate,
        isBillable: dto.isBillable,
        date: dto.date ? new Date(dto.date) : undefined,
      },
      include: { lawyer: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.auditService.log({ userId, action: 'UPDATE', entityType: 'TimeEntry', entityId: id });
    return updated;
  }

  async remove(id: string, userId: string, userRole: string) {
    const entry = await this.findOne(id);
    if (entry.isBilled) throw new BadRequestException('Cannot delete a billed time entry');

    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
    if (entry.lawyerId !== userId && !isAdmin) throw new ForbiddenException('You can only delete your own time entries');

    await this.prisma.timeEntry.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log({ userId, action: 'DELETE', entityType: 'TimeEntry', entityId: id });
  }

  async getSummary(caseId: string) {
    const entries = await this.prisma.timeEntry.findMany({
      where: { caseId, isBillable: true },
      select: { hours: true, rate: true, isBilled: true },
    });

    let totalHours = new Decimal(0), totalAmount = new Decimal(0);
    let unbilledHours = new Decimal(0), unbilledAmount = new Decimal(0);
    for (const e of entries) {
      const h = new Decimal(e.hours);
      const a = h.mul(e.rate);
      totalHours = totalHours.add(h);
      totalAmount = totalAmount.add(a);
      if (!e.isBilled) { unbilledHours = unbilledHours.add(h); unbilledAmount = unbilledAmount.add(a); }
    }

    return {
      totalHours: totalHours.toNumber(),
      totalAmount: totalAmount.toNumber(),
      unbilledHours: unbilledHours.toNumber(),
      unbilledAmount: unbilledAmount.toNumber(),
    };
  }
}
