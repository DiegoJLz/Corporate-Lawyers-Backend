import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { ConflictCheckService } from './conflict-check.service';
import { WebhookDispatcherService } from '../../modules/integrations/webhooks/webhook-dispatcher.service';
import { AppCacheService } from '../../common/cache/cache.service';
import { CacheKeys, CacheTTL } from '../../common/cache/cache-key.constants';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CaseQueryDto } from './dto/case-query.dto';
import { AddPartyDto, UpdatePartyDto } from './dto/add-party.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { AssignLawyerDto } from './dto/assign-lawyer.dto';
import {
  Prisma,
  CaseStatus,
  CaseAssignmentRole,
  UserRole,
} from '@prisma/client';
import { CASE_NUMBER_PREFIX } from '../../common/constants/app.constants';

// Valid status transitions
const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  INTAKE: [CaseStatus.ACTIVE],
  ACTIVE: [CaseStatus.IN_HEARING, CaseStatus.CLOSED],
  IN_HEARING: [CaseStatus.SENTENCING, CaseStatus.ACTIVE, CaseStatus.CLOSED],
  SENTENCING: [CaseStatus.APPEAL, CaseStatus.CLOSED],
  APPEAL: [CaseStatus.IN_HEARING, CaseStatus.CLOSED],
  CLOSED: [CaseStatus.ARCHIVED],
  ARCHIVED: [],
};

@Injectable()
export class CaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly conflictCheckService: ConflictCheckService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly cacheService: AppCacheService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────

  async create(dto: CreateCaseDto, userId: string) {
    // Validate client profile exists
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { id: dto.clientProfileId },
      include: { user: { select: { id: true, status: true, firstName: true, lastName: true } } },
    });
    if (!clientProfile || clientProfile.user.status !== 'ACTIVE') {
      throw new BadRequestException('Client profile not found or inactive');
    }

    // Validate lawyer exists and is active
    const lawyer = await this.prisma.user.findFirst({
      where: { id: dto.assignedLawyerId, role: UserRole.LAWYER, deletedAt: null },
    });
    if (!lawyer || lawyer.status !== 'ACTIVE') {
      throw new BadRequestException('Assigned lawyer not found or not active');
    }

    // Auto conflict check on client name
    const clientName = `${clientProfile.user.firstName} ${clientProfile.user.lastName}`;
    const conflictResult = await this.conflictCheckService.checkByName(clientName);

    // C2 FIX: Generate caseNumber + create case in serializable transaction
    const newCase = await this.prisma.$transaction(async (tx: any) => {
      const caseNumber = await this.generateCaseNumber(tx);

      const created = await tx.case.create({
        data: {
          caseNumber,
          title: dto.title,
          description: dto.description,
          type: dto.type,
          priority: dto.priority ?? 'MEDIUM',
          legalArea: dto.legalArea,
          court: dto.court,
          courtFileNumber: dto.courtFileNumber,
          clientProfileId: dto.clientProfileId,
        },
      });

      // Create lead attorney assignment inside transaction
      await tx.caseAssignment.create({
        data: {
          caseId: created.id,
          userId: dto.assignedLawyerId,
          role: CaseAssignmentRole.LEAD_ATTORNEY,
        },
      });

      // Create timeline entry inside transaction
      await tx.caseTimeline.create({
        data: {
          caseId: created.id,
          eventType: 'CASE_CREATED',
          title: 'Caso creado',
          isPublic: true,
          metadata: {
            title: dto.title,
            type: dto.type,
            lawyer: `${lawyer.firstName} ${lawyer.lastName}`,
          },
        },
      });

      return created;
    }, { isolationLevel: 'Serializable' });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entityType: 'Case',
      entityId: newCase.id,
      newValue: { caseNumber: newCase.caseNumber, title: dto.title },
    });

    await this.webhookDispatcher.dispatch('case.created', { caseId: newCase.id, caseNumber: newCase.caseNumber, type: newCase.type, clientId: dto.clientProfileId });

    const caseData = await this.findOne(newCase.id);

    // Return with conflict warnings if any
    return {
      ...caseData,
      ...(conflictResult.hasConflict && {
        warnings: {
          conflictOfInterest: {
            message: `Potential conflict of interest detected for "${clientName}"`,
            matches: conflictResult.matches,
          },
        },
      }),
    };
  }

  async findAll(query: CaseQueryDto, userId: string, userRole: string) {
    const where: Prisma.CaseWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.clientId) where.clientProfileId = query.clientId;

    if (query.lawyerId) {
      where.assignments = { some: { userId: query.lawyerId, removedAt: null } };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { caseNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      where.startDate = {};
      if (query.dateFrom) where.startDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startDate.lte = new Date(query.dateTo);
    }

    // A2 FIX: Role-based case visibility
    if (userRole === UserRole.CLIENT) {
      const clientProfile = await this.prisma.clientProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (clientProfile) {
        where.clientProfileId = clientProfile.id;
      } else {
        return { data: [], meta: { total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0, hasNextPage: false, hasPreviousPage: false } };
      }
    } else if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      where.assignments = {
        ...where.assignments as any,
        some: { userId, removedAt: null },
      };
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          clientProfile: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
          assignments: {
            where: { removedAt: null },
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
          },
          _count: { select: { parties: true, notes: true, tasks: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data,
      meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 },
    };
  }

  async findOne(id: string) {
    return this.cacheService.getOrSet(
      CacheKeys.CASE_DETAIL(id),
      async () => {
        const caseData = await this.prisma.case.findFirst({
          where: { id },
          include: {
            clientProfile: {
              include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            },
            assignments: {
              where: { removedAt: null },
              include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
            },
            _count: { select: { parties: true, notes: true, tasks: true, caseDocuments: true } },
          },
        });

        if (!caseData) {
          throw new NotFoundException(`Case with ID ${id} not found`);
        }

        return caseData;
      },
      CacheTTL.MEDIUM,
    );
  }

  async update(id: string, dto: UpdateCaseDto, userId: string) {
    const existing = await this.findOne(id);

    if (existing.status === 'CLOSED' || existing.status === 'ARCHIVED') {
      throw new BadRequestException(`Case ${existing.caseNumber} is ${existing.status} and cannot be modified`);
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        priority: dto.priority,
        legalArea: dto.legalArea,
        court: dto.court,
        courtFileNumber: dto.courtFileNumber,
      },
    });

    await this.cacheService.del(CacheKeys.CASE_DETAIL(id));

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'Case',
      entityId: id,
    });

    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);

    await this.prisma.case.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.cacheService.del(CacheKeys.CASE_DETAIL(id));

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entityType: 'Case',
      entityId: id,
    });
  }

  // ─── Status Transitions ──────────────────────────────────────

  async updateStatus(id: string, dto: UpdateStatusDto, userId: string, userRole: string) {
    const existing = await this.findOne(id);
    const allowedTransitions = STATUS_TRANSITIONS[existing.status];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Status transition not allowed: ${existing.status} → ${dto.status}`,
      );
    }

    // CLOSED → ARCHIVED only by admins
    if (existing.status === CaseStatus.CLOSED && dto.status === CaseStatus.ARCHIVED) {
      if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
        throw new ForbiddenException('Only administrators can archive cases');
      }
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        status: dto.status,
        closeDate: dto.status === CaseStatus.CLOSED ? new Date() : undefined,
      },
    });

    await this.createTimelineEntry(id, 'STATUS_CHANGED', `Status: ${existing.status} → ${dto.status}`, true, {
      oldStatus: existing.status,
      newStatus: dto.status,
      reason: dto.reason,
    });

    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'Case',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status, reason: dto.reason },
    });

    await this.webhookDispatcher.dispatch('case.status_changed', { caseId: id, caseNumber: existing.caseNumber, oldStatus: existing.status, newStatus: dto.status });

    if (dto.status === CaseStatus.CLOSED) {
      await this.webhookDispatcher.dispatch('case.closed', { caseId: id, caseNumber: existing.caseNumber, closeDate: new Date().toISOString() });
    }

    return this.findOne(id);
  }

  // ─── Assignments ──────────────────────────────────────────────

  async getAssignments(caseId: string) {
    await this.findOne(caseId);
    return this.prisma.caseAssignment.findMany({
      where: { caseId, removedAt: null },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    });
  }

  async assignLawyer(caseId: string, dto: AssignLawyerDto, userId: string) {
    await this.findOne(caseId);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
    });
    if (!user || (user.role !== UserRole.LAWYER && user.role !== UserRole.ASSISTANT)) {
      throw new BadRequestException('User must be a LAWYER or ASSISTANT');
    }

    const assignmentRole = dto.role ?? CaseAssignmentRole.CO_COUNSEL;

    // If assigning new LEAD_ATTORNEY, demote existing one
    if (assignmentRole === CaseAssignmentRole.LEAD_ATTORNEY) {
      await this.prisma.caseAssignment.updateMany({
        where: { caseId, role: CaseAssignmentRole.LEAD_ATTORNEY, removedAt: null },
        data: { role: CaseAssignmentRole.CO_COUNSEL },
      });
    }

    // Upsert — if already assigned, update role
    const existing = await this.prisma.caseAssignment.findFirst({
      where: { caseId, userId: dto.userId },
    });

    if (existing) {
      await this.prisma.caseAssignment.update({
        where: { id: existing.id },
        data: { role: assignmentRole, removedAt: null },
      });
    } else {
      await this.prisma.caseAssignment.create({
        data: { caseId, userId: dto.userId, role: assignmentRole },
      });
    }

    await this.createTimelineEntry(caseId, 'LAWYER_ASSIGNED', `${user.firstName} ${user.lastName} assigned as ${assignmentRole}`, false, {
      lawyerName: `${user.firstName} ${user.lastName}`,
      role: assignmentRole,
    });

    await this.auditService.log({ userId, action: 'ASSIGN_LAWYER', entityType: 'Case', entityId: caseId });

    return this.getAssignments(caseId);
  }

  async removeAssignment(caseId: string, targetUserId: string, userId: string) {
    const assignment = await this.prisma.caseAssignment.findFirst({
      where: { caseId, userId: targetUserId, removedAt: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.prisma.caseAssignment.update({
      where: { id: assignment.id },
      data: { removedAt: new Date() },
    });

    await this.createTimelineEntry(caseId, 'LAWYER_REMOVED', `${assignment.user.firstName} ${assignment.user.lastName} removed`, false);

    await this.auditService.log({ userId, action: 'REMOVE_ASSIGNMENT', entityType: 'Case', entityId: caseId });
  }

  // ─── Parties ──────────────────────────────────────────────────

  async getParties(caseId: string) {
    await this.findOne(caseId);
    return this.prisma.caseParty.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async addParty(caseId: string, dto: AddPartyDto, userId: string) {
    await this.findOne(caseId);

    const party = await this.prisma.caseParty.create({
      data: { caseId, ...dto },
    });

    await this.createTimelineEntry(caseId, 'PARTY_ADDED', `Party added: ${dto.name} (${dto.role})`, false, {
      name: dto.name,
      role: dto.role,
    });

    await this.auditService.log({ userId, action: 'ADD_PARTY', entityType: 'CaseParty', entityId: party.id });

    return party;
  }

  async updateParty(caseId: string, partyId: string, dto: UpdatePartyDto) {
    const party = await this.prisma.caseParty.findFirst({ where: { id: partyId, caseId } });
    if (!party) throw new NotFoundException('Party not found');

    return this.prisma.caseParty.update({ where: { id: partyId }, data: dto });
  }

  async removeParty(caseId: string, partyId: string, userId: string) {
    const party = await this.prisma.caseParty.findFirst({ where: { id: partyId, caseId } });
    if (!party) throw new NotFoundException('Party not found');

    await this.prisma.caseParty.delete({ where: { id: partyId } });

    await this.auditService.log({ userId, action: 'REMOVE_PARTY', entityType: 'CaseParty', entityId: partyId });
  }

  // ─── Notes ──────────────────────────────────────────────────

  async getNotes(caseId: string, isInternal?: boolean, limit = 20, offset = 0) {
    await this.findOne(caseId);

    const where: Prisma.CaseNoteWhereInput = { caseId };
    if (isInternal !== undefined) where.isInternal = isInternal;

    const [data, total] = await Promise.all([
      this.prisma.caseNote.findMany({
        where,
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.caseNote.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasNextPage: offset + limit < total, hasPreviousPage: offset > 0 } };
  }

  async addNote(caseId: string, dto: AddNoteDto, authorId: string) {
    await this.findOne(caseId);

    const note = await this.prisma.caseNote.create({
      data: {
        caseId,
        authorId,
        content: dto.content,
        isInternal: dto.isInternal ?? true,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    const isPublic = !(dto.isInternal ?? true);
    await this.createTimelineEntry(caseId, 'NOTE_ADDED', `Note added by ${note.author.firstName} ${note.author.lastName}`, isPublic);

    return note;
  }

  async updateNote(noteId: string, content: string, userId: string, userRole: string) {
    const note = await this.prisma.caseNote.findFirst({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');

    if (note.authorId !== userId && userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only edit your own notes');
    }

    return this.prisma.caseNote.update({ where: { id: noteId }, data: { content } });
  }

  async removeNote(noteId: string, userId: string, userRole: string) {
    const note = await this.prisma.caseNote.findFirst({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');

    if (note.authorId !== userId && userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own notes');
    }

    await this.prisma.caseNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
  }

  // ─── Timeline ──────────────────────────────────────────────

  async getTimeline(caseId: string, limit = 20, cursor?: string) {
    await this.findOne(caseId);

    const where: Prisma.CaseTimelineWhereInput = { caseId };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const data = await this.prisma.caseTimeline.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    return {
      data,
      meta: {
        limit,
        hasNextPage,
        nextCursor: hasNextPage ? data[data.length - 1].createdAt.toISOString() : undefined,
      },
    };
  }

  // ─── Tasks ──────────────────────────────────────────────────

  async getTasks(caseId: string, filters?: { isCompleted?: boolean; assigneeId?: string; priority?: string }) {
    await this.findOne(caseId);

    const where: Prisma.CaseTaskWhereInput = { caseId };
    if (filters?.isCompleted !== undefined) where.isCompleted = filters.isCompleted;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters?.priority) where.priority = filters.priority as any;

    return this.prisma.caseTask.findMany({
      where,
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async createTask(caseId: string, dto: CreateTaskDto, userId: string) {
    await this.findOne(caseId);

    const task = await this.prisma.caseTask.create({
      data: {
        caseId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority ?? 'MEDIUM',
      },
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.createTimelineEntry(caseId, 'TASK_CREATED', `Task: ${dto.title}`, false);

    return task;
  }

  async updateTask(caseId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.caseTask.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('Task not found in this case');

    return this.prisma.caseTask.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
      },
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async completeTask(caseId: string, taskId: string, userId: string) {
    const task = await this.prisma.caseTask.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('Task not found in this case');

    const updated = await this.prisma.caseTask.update({
      where: { id: taskId },
      data: { isCompleted: true, completedAt: new Date() },
    });

    await this.createTimelineEntry(task.caseId, 'TASK_COMPLETED', `Task completed: ${task.title}`, true);

    return updated;
  }

  async removeTask(caseId: string, taskId: string) {
    const task = await this.prisma.caseTask.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('Task not found in this case');
    await this.prisma.caseTask.delete({ where: { id: taskId } });
  }

  // ─── Access Control ──────────────────────────────────────────

  async assertCaseAccess(caseId: string, userId: string, userRole: string, requiredAssignmentRole?: CaseAssignmentRole) {
    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN) return;

    // A1 FIX: CLIENT verifies via clientProfile, not caseAssignment
    if (userRole === UserRole.CLIENT) {
      const clientProfile = await this.prisma.clientProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!clientProfile) throw new ForbiddenException('Client profile not found');

      const caseRecord = await this.prisma.case.findFirst({
        where: { id: caseId, clientProfileId: clientProfile.id, deletedAt: null },
      });
      if (!caseRecord) throw new ForbiddenException('You do not have access to this case');
      return;
    }

    // LAWYER/ASSISTANT: verify caseAssignment
    const assignment = await this.prisma.caseAssignment.findFirst({
      where: { caseId, userId, removedAt: null },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have access to this case');
    }

    if (requiredAssignmentRole && assignment.role !== requiredAssignmentRole) {
      throw new ForbiddenException(`This action requires ${requiredAssignmentRole} role on the case`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  // C2 FIX: Accepts optional tx (transaction client) for serializable isolation
  private async generateCaseNumber(tx?: any): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const prefix = `${CASE_NUMBER_PREFIX}-${year}-`;

    const lastCase = await db.case.findFirst({
      where: { caseNumber: { startsWith: prefix } },
      orderBy: { caseNumber: 'desc' },
    });

    const nextNumber = lastCase
      ? parseInt(lastCase.caseNumber.split('-').pop()!, 10) + 1
      : 1;

    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  private async createTimelineEntry(
    caseId: string,
    eventType: string,
    title: string,
    isPublic: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.caseTimeline.create({
      data: {
        caseId,
        eventType,
        title,
        isPublic,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
