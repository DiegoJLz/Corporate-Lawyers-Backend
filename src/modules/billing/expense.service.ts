import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { CaseService } from '../case/case.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly caseService: CaseService,
  ) {}

  async create(dto: CreateExpenseDto, createdById: string, userRole: string) {
    await this.caseService.assertCaseAccess(dto.caseId, createdById, userRole);

    const caseData = await this.caseService.findOne(dto.caseId);
    if (caseData.status === 'CLOSED' || caseData.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot add expenses to a closed or archived case');
    }

    const expense = await this.prisma.expense.create({
      data: {
        caseId: dto.caseId,
        createdById,
        description: dto.description,
        amount: dto.amount,
        isBillable: dto.isBillable ?? true,
        date: new Date(dto.date),
        receiptUrl: dto.receiptUrl,
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.auditService.log({ userId: createdById, action: 'CREATE', entityType: 'Expense', entityId: expense.id });
    return expense;
  }

  async findAll(query: ExpenseQueryDto, userId: string, userRole: string) {
    const where: Prisma.ExpenseWhereInput = {};
    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;

    if (!isAdmin) {
      where.case = { assignments: { some: { userId, removedAt: null } } };
    }
    if (query.caseId) where.caseId = query.caseId;
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
      this.prisma.expense.findMany({
        where, orderBy: { [query.sortBy ?? 'date']: query.sortOrder ?? 'desc' },
        take: limit, skip: offset,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          case: { select: { id: true, caseNumber: true, title: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 } };
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);

    // C3 FIX: verify case access
    if (userId && userRole) {
      await this.caseService.assertCaseAccess(expense.caseId, userId, userRole);
    }

    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string, userRole: string) {
    const expense = await this.findOne(id, userId, userRole);
    if (expense.isBilled) throw new BadRequestException('Cannot modify a billed expense');

    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
    if (expense.createdById !== userId && !isAdmin) throw new ForbiddenException('You can only edit your own expenses');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        description: dto.description,
        amount: dto.amount,
        isBillable: dto.isBillable,
        date: dto.date ? new Date(dto.date) : undefined,
        receiptUrl: dto.receiptUrl,
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.auditService.log({ userId, action: 'UPDATE', entityType: 'Expense', entityId: id });
    return updated;
  }

  async remove(id: string, userId: string, userRole: string) {
    const expense = await this.findOne(id, userId, userRole);
    if (expense.isBilled) throw new BadRequestException('Cannot delete a billed expense');

    const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
    if (expense.createdById !== userId && !isAdmin) throw new ForbiddenException('You can only delete your own expenses');

    await this.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.auditService.log({ userId, action: 'DELETE', entityType: 'Expense', entityId: id });
  }
}
