import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { NotificationService } from '../../services/notification/notification.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { WebhookDispatcherService } from '../../modules/integrations/webhooks/webhook-dispatcher.service';
import {
  Prisma,
  LeadStatus,
  LeadSource,
  UserRole,
  UserStatus,
  NotificationType,
  ClientType,
} from '@prisma/client';

// Valid status transitions
const STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: [LeadStatus.CONTACTED, LeadStatus.DISCARDED],
  CONTACTED: [LeadStatus.QUALIFIED, LeadStatus.DISCARDED],
  QUALIFIED: [LeadStatus.CONSULTATION_SCHEDULED, LeadStatus.DISCARDED],
  CONSULTATION_SCHEDULED: [LeadStatus.CONVERTED, LeadStatus.DISCARDED],
  CONVERTED: [],
  DISCARDED: [LeadStatus.NEW],
};

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────

  async create(dto: CreateLeadDto, userId?: string) {
    // Check duplicate active email (not CONVERTED or DISCARDED)
    const existing = await this.prisma.lead.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.DISCARDED] },
      },
    });

    if (existing) {
      throw new ConflictException('An active lead with this email already exists');
    }

    const lead = await this.prisma.lead.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        source: dto.source ?? LeadSource.WEBSITE,
        areaOfInterest: dto.areaOfInterest,
        message: dto.message,
        score: 0,
        status: LeadStatus.NEW,
      },
    });

    // Calculate initial score
    const score = await this.calculateScore(lead, false, false);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { score },
    });

    if (userId) {
      await this.auditService.log({
        userId,
        action: 'CREATE',
        entityType: 'Lead',
        entityId: lead.id,
        newValue: { firstName: dto.firstName, lastName: dto.lastName, email: dto.email },
      });
    }

    await this.webhookDispatcher.dispatch('lead.created', { leadId: lead.id, name: dto.firstName + ' ' + dto.lastName, email: dto.email, source: dto.source || 'WEBSITE' });

    return updated;
  }

  async findAll(query: LeadQueryDto, userId: string, userRole: string) {
    const where: Prisma.LeadWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.scoreMin !== undefined || query.scoreMax !== undefined) {
      where.score = {};
      if (query.scoreMin !== undefined) where.score.gte = query.scoreMin;
      if (query.scoreMax !== undefined) where.score.lte = query.scoreMax;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    // LAWYER role only sees assigned leads
    if (userRole === UserRole.LAWYER) {
      where.assignedToId = userId;
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
          intakeForm: { select: { id: true, submittedAt: true } },
          _count: { select: { conflictChecks: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.lead.count({ where }),
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

  async findOne(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        intakeForm: true,
        conflictChecks: {
          include: { checkedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { checkedAt: 'desc' },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, userId: string, userRole: string) {
    const existing = await this.findOne(id);

    // Validate status transition if status is being changed
    if (dto.status && dto.status !== existing.status) {
      const allowedTransitions = STATUS_TRANSITIONS[existing.status];

      if (!allowedTransitions.includes(dto.status)) {
        throw new BadRequestException(
          `Status transition not allowed: ${existing.status} → ${dto.status}`,
        );
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email ? dto.email.toLowerCase() : undefined,
        phone: dto.phone,
        source: dto.source,
        areaOfInterest: dto.areaOfInterest,
        message: dto.message,
        status: dto.status,
        score: dto.score,
      },
    });

    // Recalculate score
    const hasIntake = !!existing.intakeForm;
    const hasCleanConflictCheck = existing.conflictChecks.some((c) => c.result === true);
    const score = await this.calculateScore(updated, hasIntake, hasCleanConflictCheck);
    const result = await this.prisma.lead.update({
      where: { id },
      data: { score },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'Lead',
      entityId: id,
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const lead = await this.findOne(id);

    if (lead.status !== LeadStatus.NEW) {
      throw new BadRequestException('Only leads with status NEW can be deleted');
    }

    if (lead.intakeForm) {
      throw new BadRequestException('Cannot delete a lead that has an intake form');
    }

    await this.prisma.lead.delete({ where: { id } });
  }

  // ─── Assignment ──────────────────────────────────────────────

  async assign(id: string, dto: AssignLeadDto) {
    await this.findOne(id);

    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.assignedToId, deletedAt: null },
    });

    if (!assignee) {
      throw new NotFoundException('Assignee user not found');
    }

    if (assignee.role !== UserRole.LAWYER && assignee.role !== UserRole.ADMIN) {
      throw new BadRequestException('Lead can only be assigned to a LAWYER or ADMIN');
    }

    if (assignee.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assignee user is not active');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
    });

    return this.findOne(id);
  }

  // ─── Convert ──────────────────────────────────────────────────

  async convert(id: string, dto: ConvertLeadDto, userId: string) {
    const lead = await this.findOne(id);

    if (lead.status !== LeadStatus.QUALIFIED && lead.status !== LeadStatus.CONSULTATION_SCHEDULED) {
      throw new BadRequestException(
        `Lead must be in QUALIFIED or CONSULTATION_SCHEDULED status to convert. Current status: ${lead.status}`,
      );
    }

    // Check if a user with this email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: lead.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx: any) => {
      // Create user with CLIENT role
      const newUser = await tx.user.create({
        data: {
          email: lead.email,
          passwordHash,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
        },
      });

      // Create client profile
      await tx.clientProfile.create({
        data: {
          userId: newUser.id,
          clientType: dto.clientType ?? ClientType.INDIVIDUAL,
          rfc: dto.rfc,
          companyName: dto.companyName,
        },
      });

      // Update lead status to CONVERTED
      await tx.lead.update({
        where: { id },
        data: { status: LeadStatus.CONVERTED },
      });

      return newUser;
    });

    // A1 FIX: Send email to new client with welcome info
    await this.notificationService.send({
      userId: result.id,
      type: NotificationType.EMAIL,
      title: 'Bienvenido a Corporate Lawyers',
      body: `Su cuenta ha sido creada. Puede iniciar sesión con su email: ${lead.email}`,
      data: { leadId: id },
    });

    // Also notify assigned lawyer via in-app
    if (lead.assignedToId) {
      await this.notificationService.send({
        userId: lead.assignedToId,
        type: NotificationType.IN_APP,
        title: 'Lead convertido a cliente',
        body: `${lead.firstName} ${lead.lastName} ha sido convertido a cliente.`,
        data: { leadId: id, newUserId: result.id },
      });
    }

    await this.auditService.log({
      userId,
      action: 'CONVERT',
      entityType: 'Lead',
      entityId: id,
      newValue: { newUserId: result.id, email: lead.email },
    });

    await this.webhookDispatcher.dispatch('lead.converted', { leadId: id, userId: result.id });

    return this.findOne(id);
  }

  // ─── Conflict Check ──────────────────────────────────────────

  async conflictCheck(id: string, checkedById: string) {
    const lead = await this.findOne(id);
    const fullName = `${lead.firstName} ${lead.lastName}`;

    // Search CaseParty by lead name (case-insensitive)
    const partyMatches = await this.prisma.caseParty.findMany({
      where: {
        name: { contains: fullName, mode: 'insensitive' },
      },
      include: {
        case: { select: { id: true, caseNumber: true, title: true, status: true } },
      },
    });

    // Search existing ClientProfile + User by name
    const clientMatches = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: UserRole.CLIENT,
        OR: [
          {
            AND: [
              { firstName: { contains: lead.firstName, mode: 'insensitive' } },
              { lastName: { contains: lead.lastName, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        clientProfile: { select: { id: true, clientType: true } },
      },
    });

    const hasConflict = partyMatches.length > 0 || clientMatches.length > 0;

    // Create ConflictCheck record
    const conflictCheck = await this.prisma.conflictCheck.create({
      data: {
        leadId: id,
        checkedById,
        result: !hasConflict, // true = clean (no conflict), false = conflict found
        details: hasConflict
          ? JSON.stringify({
              partyMatches: partyMatches.map((p) => ({
                name: p.name,
                role: p.role,
                caseNumber: p.case.caseNumber,
                caseTitle: p.case.title,
              })),
              clientMatches: clientMatches.map((c) => ({
                name: `${c.firstName} ${c.lastName}`,
                email: c.email,
              })),
            })
          : null,
      },
      include: {
        checkedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Recalculate score after conflict check
    const hasIntake = !!lead.intakeForm;
    const hasCleanConflictCheck = !hasConflict || lead.conflictChecks.some((c) => c.result === true);
    const score = await this.calculateScore(lead, hasIntake, hasCleanConflictCheck);
    await this.prisma.lead.update({
      where: { id },
      data: { score },
    });

    await this.auditService.log({
      userId: checkedById,
      action: 'CONFLICT_CHECK',
      entityType: 'Lead',
      entityId: id,
      newValue: { hasConflict, partyCount: partyMatches.length, clientCount: clientMatches.length },
    });

    return {
      conflictCheck,
      hasConflict,
      partyMatches,
      clientMatches,
    };
  }

  async getConflictChecks(leadId: string) {
    await this.findOne(leadId);

    return this.prisma.conflictCheck.findMany({
      where: { leadId },
      include: {
        checkedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { checkedAt: 'desc' },
    });
  }

  // ─── Score Calculation ──────────────────────────────────────────

  async calculateScore(
    lead: { email?: string; phone?: string | null; source?: LeadSource; message?: string | null; areaOfInterest?: string | null },
    hasIntake: boolean,
    hasCleanConflictCheck: boolean,
  ): Promise<number> {
    let score = 0;

    if (lead.email) score += 10;
    if (lead.phone) score += 5;
    if (hasIntake) score += 20;

    if (lead.source === LeadSource.REFERRAL) score += 15;
    if (lead.source === LeadSource.WEBSITE || lead.source === LeadSource.SOCIAL_MEDIA) score += 10;
    if (lead.source === LeadSource.WALK_IN) score += 5;

    if (lead.message && lead.message.length > 100) score += 10;
    if (hasCleanConflictCheck) score += 15;

    // M3 FIX: areaOfInterest matches a lawyer specialization: +15
    if (lead.areaOfInterest) {
      const matchingLawyer = await this.prisma.lawyerProfile.findFirst({
        where: { specializations: { has: lead.areaOfInterest } },
      });
      if (matchingLawyer) score += 15;
    }

    return Math.min(score, 100);
  }
}
