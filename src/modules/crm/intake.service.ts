import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationService } from '../../services/notification/notification.service';
import { LeadService } from './lead.service';
import { SubmitIntakeDto } from './dto/submit-intake.dto';
import { LeadStatus, NotificationType, UserRole } from '@prisma/client';

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly leadService: LeadService,
  ) {}

  async submit(leadId: string, dto: SubmitIntakeDto, userId: string) {
    // Verify lead exists
    const lead = await this.leadService.findOne(leadId);

    // Verify no existing intake form
    const existingIntake = await this.prisma.intakeForm.findUnique({
      where: { leadId },
    });

    if (existingIntake) {
      throw new ConflictException('An intake form has already been submitted for this lead');
    }

    // Create intake form
    const intakeForm = await this.prisma.intakeForm.create({
      data: {
        leadId,
        responses: dto.responses,
      },
    });

    // Auto-update lead status to CONTACTED if currently NEW
    if (lead.status === LeadStatus.NEW) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.CONTACTED },
      });
    }

    // Recalculate score (now has intake) — calculateScore is async
    const hasCleanConflictCheck = lead.conflictChecks?.some((c: any) => c.result === true) ?? false;
    const score = await this.leadService.calculateScore(lead, true, hasCleanConflictCheck);
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { score },
    });

    // M4 FIX: Notify assigned lawyer, or all admins if no one assigned
    if (lead.assignedToId) {
      await this.notificationService.send({
        userId: lead.assignedToId,
        type: NotificationType.IN_APP,
        title: 'Formulario de intake recibido',
        body: `Se ha recibido un formulario de intake para el lead ${lead.firstName} ${lead.lastName}.`,
        data: { leadId, intakeFormId: intakeForm.id },
      });
    } else {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      for (const admin of admins) {
        await this.notificationService.send({
          userId: admin.id,
          type: NotificationType.IN_APP,
          title: 'Nuevo formulario de intake (sin abogado asignado)',
          body: `Intake para ${lead.firstName} ${lead.lastName}. Sin abogado asignado.`,
          data: { leadId, intakeFormId: intakeForm.id },
        });
      }
    }

    return intakeForm;
  }

  async findOne(leadId: string) {
    const intakeForm = await this.prisma.intakeForm.findUnique({
      where: { leadId },
    });

    if (!intakeForm) {
      throw new NotFoundException(`Intake form not found for lead ${leadId}`);
    }

    return intakeForm;
  }

  async update(leadId: string, dto: SubmitIntakeDto) {
    // Verify lead exists and is not CONVERTED
    const lead = await this.leadService.findOne(leadId);

    if (lead.status === LeadStatus.CONVERTED) {
      throw new BadRequestException('Cannot update intake form for a converted lead');
    }

    // Verify intake form exists
    const existing = await this.prisma.intakeForm.findUnique({
      where: { leadId },
    });

    if (!existing) {
      throw new NotFoundException(`Intake form not found for lead ${leadId}`);
    }

    return this.prisma.intakeForm.update({
      where: { leadId },
      data: { responses: dto.responses },
    });
  }
}
