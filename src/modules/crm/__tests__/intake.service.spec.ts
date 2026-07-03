import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { IntakeService } from '../intake.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { LeadService } from '../lead.service';
import { LeadStatus } from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockLead = {
  id: 'lead-1',
  firstName: 'Juan',
  lastName: 'Perez',
  email: 'juan@example.com',
  phone: '+52 55 1234 5678',
  status: LeadStatus.NEW,
  assignedToId: 'lawyer-1',
  assignedTo: {
    id: 'lawyer-1',
    firstName: 'Ana',
    lastName: 'Garcia',
    email: 'ana@test.com',
    role: 'LAWYER',
  },
  intakeForm: null,
  conflictChecks: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const mockContactedLead = {
  ...mockLead,
  status: LeadStatus.CONTACTED,
};

const mockConvertedLead = {
  ...mockLead,
  status: LeadStatus.CONVERTED,
};

const mockIntakeForm = {
  id: 'intake-1',
  leadId: 'lead-1',
  responses: { legalIssue: 'Constitucion de sociedad', urgency: 'medium' },
  submittedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const submitDto = {
  responses: { legalIssue: 'Constitucion de sociedad', urgency: 'medium' },
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

describe('IntakeService', () => {
  let service: IntakeService;

  const mockPrismaIntakeForm = createMockModel();
  const mockPrismaLead = createMockModel();

  const mockLeadService = {
    findOne: jest.fn(),
    calculateScore: jest.fn(),
  };

  const mockNotificationService = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        {
          provide: PrismaService,
          useValue: {
            get intakeForm() { return mockPrismaIntakeForm; },
            get lead() { return mockPrismaLead; },
          },
        },
        {
          provide: LeadService,
          useValue: mockLeadService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<IntakeService>(IntakeService);
  });

  // ─── submit ─────────────────────────────────────────────────────

  describe('submit', () => {
    it('should create an IntakeForm', async () => {
      mockLeadService.findOne.mockResolvedValue(mockLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);
      mockPrismaIntakeForm.create.mockResolvedValue(mockIntakeForm);
      mockPrismaLead.update.mockResolvedValue({});
      mockLeadService.calculateScore.mockReturnValue(30);

      const result = await service.submit('lead-1', submitDto, 'admin-1');

      expect(result).toEqual(mockIntakeForm);
      expect(mockPrismaIntakeForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            responses: submitDto.responses,
          }),
        }),
      );
    });

    it('should reject duplicate intake form', async () => {
      mockLeadService.findOne.mockResolvedValue(mockLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(mockIntakeForm);

      await expect(
        service.submit('lead-1', submitDto, 'admin-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaIntakeForm.create).not.toHaveBeenCalled();
    });

    it('should auto-update lead status to CONTACTED if currently NEW', async () => {
      mockLeadService.findOne.mockResolvedValue(mockLead); // status=NEW
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);
      mockPrismaIntakeForm.create.mockResolvedValue(mockIntakeForm);
      mockPrismaLead.update.mockResolvedValue({});
      mockLeadService.calculateScore.mockReturnValue(30);

      await service.submit('lead-1', submitDto, 'admin-1');

      // First update: status change to CONTACTED
      expect(mockPrismaLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { status: LeadStatus.CONTACTED },
        }),
      );
    });

    it('should NOT auto-update status if lead is not NEW', async () => {
      mockLeadService.findOne.mockResolvedValue(mockContactedLead); // status=CONTACTED
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);
      mockPrismaIntakeForm.create.mockResolvedValue(mockIntakeForm);
      mockPrismaLead.update.mockResolvedValue({});
      mockLeadService.calculateScore.mockReturnValue(30);

      await service.submit('lead-1', submitDto, 'admin-1');

      // Only the score update should happen, not the status update
      expect(mockPrismaLead.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: LeadStatus.CONTACTED },
        }),
      );
    });

    it('should send notification to assigned lawyer', async () => {
      mockLeadService.findOne.mockResolvedValue(mockLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);
      mockPrismaIntakeForm.create.mockResolvedValue(mockIntakeForm);
      mockPrismaLead.update.mockResolvedValue({});
      mockLeadService.calculateScore.mockReturnValue(30);

      await service.submit('lead-1', submitDto, 'admin-1');

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          title: expect.stringContaining('intake'),
        }),
      );
    });

    it('should recalculate score after intake submission', async () => {
      mockLeadService.findOne.mockResolvedValue(mockLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);
      mockPrismaIntakeForm.create.mockResolvedValue(mockIntakeForm);
      mockPrismaLead.update.mockResolvedValue({});
      mockLeadService.calculateScore.mockReturnValue(45);

      await service.submit('lead-1', submitDto, 'admin-1');

      expect(mockLeadService.calculateScore).toHaveBeenCalledWith(
        mockLead,
        true, // hasIntake = true
        false, // no clean conflict check
      );
      // Score update call
      expect(mockPrismaLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { score: 45 },
        }),
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────

  describe('update', () => {
    it('should update intake form responses', async () => {
      mockLeadService.findOne.mockResolvedValue(mockContactedLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(mockIntakeForm);
      const updatedDto = { responses: { legalIssue: 'Updated issue', urgency: 'high' } };
      const updatedIntake = { ...mockIntakeForm, responses: updatedDto.responses };
      mockPrismaIntakeForm.update.mockResolvedValue(updatedIntake);

      const result = await service.update('lead-1', updatedDto);

      expect(result.responses).toEqual(updatedDto.responses);
      expect(mockPrismaIntakeForm.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leadId: 'lead-1' },
          data: { responses: updatedDto.responses },
        }),
      );
    });

    it('should reject update if lead is CONVERTED', async () => {
      mockLeadService.findOne.mockResolvedValue(mockConvertedLead);

      await expect(
        service.update('lead-1', submitDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if intake form does not exist', async () => {
      mockLeadService.findOne.mockResolvedValue(mockContactedLead);
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);

      await expect(
        service.update('lead-1', submitDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return intake form for lead', async () => {
      mockPrismaIntakeForm.findUnique.mockResolvedValue(mockIntakeForm);

      const result = await service.findOne('lead-1');

      expect(result).toEqual(mockIntakeForm);
      expect(mockPrismaIntakeForm.findUnique).toHaveBeenCalledWith({
        where: { leadId: 'lead-1' },
      });
    });

    it('should throw NotFoundException when intake form not found', async () => {
      mockPrismaIntakeForm.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
