import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from '../payment.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { InvoiceStatus, PaymentStatus, CaseAssignmentRole, UserRole } from '@prisma/client';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockInvoice: Record<string, any> = {
  id: 'inv-1',
  invoiceNumber: 'FAC-2026-00001',
  caseId: 'case-1',
  clientProfileId: 'cp-1',
  subtotal: 10000,
  taxRate: 0.16,
  taxAmount: 1600,
  total: 11600,
  status: InvoiceStatus.SENT,
  dueDate: new Date('2026-08-01'),
  paidAt: null,
  payments: [],
  case: {
    id: 'case-1',
    caseNumber: 'CORP-2026-00001',
    assignments: [
      { userId: 'lawyer-1' },
    ],
  },
};

const mockPayment = {
  id: 'pay-1',
  invoiceId: 'inv-1',
  amount: 5000,
  method: 'BANK_TRANSFER',
  status: PaymentStatus.COMPLETED,
  transactionId: 'txn-uuid',
  reference: 'REF-001',
  notes: null,
  paidAt: NOW,
  invoice: {
    id: 'inv-1',
    invoiceNumber: 'FAC-2026-00001',
    caseId: 'case-1',
    total: 11600,
    status: InvoiceStatus.SENT,
  },
};

const createDto = {
  invoiceId: 'inv-1',
  amount: 5000,
  method: 'BANK_TRANSFER' as any,
  reference: 'REF-001',
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

describe('PaymentService', () => {
  let service: PaymentService;

  const mockPrismaPayment = createMockModel();
  const mockPrismaInvoice = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockNotificationService = { send: jest.fn() };

  // Transaction mock models
  const txModels = {
    payment: mockPrismaPayment,
    invoice: mockPrismaInvoice,
    caseTimeline: mockPrismaCaseTimeline,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            get payment() { return mockPrismaPayment; },
            get invoice() { return mockPrismaInvoice; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
            $transaction: jest.fn((fn: any) => fn(txModels)),
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  // Helper: setup invoice lookup for create
  function stubInvoiceLookup(overrides: Partial<typeof mockInvoice> = {}) {
    mockPrismaInvoice.findFirst.mockResolvedValue({ ...mockInvoice, ...overrides });
  }

  // Helper: setup tx mocks for a successful create
  function setupCreateMocks() {
    mockPrismaPayment.create.mockResolvedValue(mockPayment);
    mockPrismaInvoice.update.mockResolvedValue({});
    mockPrismaCaseTimeline.create.mockResolvedValue({});
    mockNotificationService.send.mockResolvedValue(undefined);
    mockAuditService.log.mockResolvedValue(undefined);
  }

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('should create payment with COMPLETED status', async () => {
      stubInvoiceLookup();
      setupCreateMocks();

      const result = await service.create(createDto, 'admin-1');

      expect(result).toEqual(mockPayment);
      expect(mockPrismaPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'inv-1',
            amount: 5000,
            method: 'BANK_TRANSFER',
            status: PaymentStatus.COMPLETED,
            transactionId: expect.any(String),
          }),
        }),
      );
    });

    it('should auto-update invoice to PAID when fully paid', async () => {
      // Invoice total=11600, no previous payments, paying full amount
      stubInvoiceLookup({ total: 11600, payments: [] });
      setupCreateMocks();

      await service.create({ ...createDto, amount: 11600 }, 'admin-1');

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            status: InvoiceStatus.PAID,
            paidAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should auto-update invoice to PARTIALLY_PAID when not fully paid', async () => {
      // Invoice total=11600, no previous payments, paying partial
      stubInvoiceLookup({ total: 11600, payments: [] });
      setupCreateMocks();

      await service.create({ ...createDto, amount: 5000 }, 'admin-1');

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            status: InvoiceStatus.PARTIALLY_PAID,
          }),
        }),
      );
      // paidAt should NOT be set for partial payments
      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ paidAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject if payment exceeds pending balance', async () => {
      // Invoice total=11600, already paid 10000, pending=1600
      stubInvoiceLookup({
        total: 11600,
        payments: [{ amount: 10000, status: PaymentStatus.COMPLETED }],
      });

      await expect(
        service.create({ ...createDto, amount: 5000 }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payment on DRAFT invoice', async () => {
      stubInvoiceLookup({ status: InvoiceStatus.DRAFT });

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payment on CANCELLED invoice', async () => {
      stubInvoiceLookup({ status: InvoiceStatus.CANCELLED });

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payment on PAID invoice', async () => {
      stubInvoiceLookup({ status: InvoiceStatus.PAID });

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a timeline entry', async () => {
      stubInvoiceLookup();
      setupCreateMocks();

      await service.create(createDto, 'admin-1');

      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            eventType: 'PAYMENT_RECEIVED',
            title: expect.stringContaining('$5000.00'),
            isPublic: true,
          }),
        }),
      );
    });

    it('should notify lead attorney', async () => {
      stubInvoiceLookup();
      setupCreateMocks();

      await service.create(createDto, 'admin-1');

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'lawyer-1',
          type: 'IN_APP',
          title: expect.stringContaining('$5000.00'),
          body: expect.stringContaining('FAC-2026-00001'),
        }),
      );
    });

    it('should reject when invoice not found', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const payments = [mockPayment];
      mockPrismaPayment.findMany.mockResolvedValue(payments);
      mockPrismaPayment.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'admin-1', UserRole.ADMIN);

      expect(result.data).toEqual(payments);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0, hasNextPage: false, hasPreviousPage: false }),
      );
    });

    it('should restrict non-admin users to payments on assigned cases', async () => {
      mockPrismaPayment.findMany.mockResolvedValue([]);
      mockPrismaPayment.count.mockResolvedValue(0);

      await service.findAll({} as any, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice: { case: { assignments: { some: { userId: 'lawyer-1', removedAt: null } } } },
          }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return payment with invoice includes', async () => {
      mockPrismaPayment.findFirst.mockResolvedValue(mockPayment);

      const result = await service.findOne('pay-1');

      expect(result).toEqual(mockPayment);
      expect(mockPrismaPayment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          include: expect.objectContaining({
            invoice: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when payment does not exist', async () => {
      mockPrismaPayment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
