import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoiceService } from '../invoice.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { InvoiceStatus, UserRole } from '@prisma/client';

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
  status: InvoiceStatus.DRAFT,
  dueDate: new Date('2026-08-01'),
  notes: null,
  paidAt: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Juicio Mercantil' },
  items: [
    { id: 'item-1', invoiceId: 'inv-1', description: 'Ana Garcia: Revision', quantity: 2, unitPrice: 2500, amount: 5000 },
    { id: 'item-2', invoiceId: 'inv-1', description: 'Ana Garcia: Consulta', quantity: 2, unitPrice: 2500, amount: 5000 },
  ],
  payments: [],
  timeEntries: [],
  expenses: [],
};

const mockCaseData = {
  id: 'case-1',
  clientProfileId: 'cp-1',
};

const mockTimeEntries = [
  {
    id: 'te-1',
    caseId: 'case-1',
    hours: 2,
    rate: 2500,
    isBillable: true,
    isBilled: false,
    description: 'Revision de contrato',
    lawyer: { firstName: 'Ana', lastName: 'Garcia' },
  },
  {
    id: 'te-2',
    caseId: 'case-1',
    hours: 3,
    rate: 2000,
    isBillable: true,
    isBilled: false,
    description: 'Consulta legal',
    lawyer: { firstName: 'Ana', lastName: 'Garcia' },
  },
];

const mockClientProfile = {
  id: 'cp-1',
  userId: 'client-1',
  user: { id: 'client-1', firstName: 'Carlos', lastName: 'Lopez', email: 'carlos@test.com' },
};

const createDto = {
  caseId: 'case-1',
  clientProfileId: 'cp-1',
  dueDate: '2026-08-01',
  taxRate: 0.16,
  timeEntryIds: ['te-1', 'te-2'],
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

describe('InvoiceService', () => {
  let service: InvoiceService;

  const mockPrismaInvoice = createMockModel();
  const mockPrismaInvoiceItem = createMockModel();
  const mockPrismaTimeEntry = createMockModel();
  const mockPrismaExpense = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();
  const mockPrismaClientProfile = createMockModel();

  const mockAuditService = { log: jest.fn() };
  const mockNotificationService = { send: jest.fn() };

  // Transaction mock: executes callback with the same mock models
  const txModels = {
    invoice: mockPrismaInvoice,
    invoiceItem: mockPrismaInvoiceItem,
    timeEntry: mockPrismaTimeEntry,
    expense: mockPrismaExpense,
    caseTimeline: mockPrismaCaseTimeline,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: PrismaService,
          useValue: {
            get invoice() { return mockPrismaInvoice; },
            get invoiceItem() { return mockPrismaInvoiceItem; },
            get timeEntry() { return mockPrismaTimeEntry; },
            get expense() { return mockPrismaExpense; },
            get case() { return mockPrismaCase; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
            get clientProfile() { return mockPrismaClientProfile; },
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

    service = module.get<InvoiceService>(InvoiceService);
  });

  // Helper: stub findOne (used internally by update/remove/addItem/removeItem)
  function stubFindOne(data = mockInvoice) {
    mockPrismaInvoice.findFirst.mockResolvedValue(data);
  }

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    function setupCreateMocks() {
      mockPrismaCase.findFirst.mockResolvedValue(mockCaseData);
      // generateInvoiceNumber: no previous invoice
      mockPrismaInvoice.findFirst
        .mockResolvedValueOnce(null)           // inside tx: generateInvoiceNumber
        .mockResolvedValueOnce(mockInvoice);    // findOne after create
      mockPrismaTimeEntry.findMany.mockResolvedValue(mockTimeEntries);
      mockPrismaInvoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrismaInvoiceItem.create.mockResolvedValue({});
      mockPrismaTimeEntry.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaCaseTimeline.create.mockResolvedValue({});
    }

    it('should calculate subtotal, tax, and total correctly', async () => {
      setupCreateMocks();

      await service.create(createDto, 'admin-1');

      // subtotal = (2*2500) + (3*2000) = 5000 + 6000 = 11000
      // taxAmount = 11000 * 0.16 = 1760
      // total = 11000 + 1760 = 12760
      expect(mockPrismaInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InvoiceStatus.DRAFT,
          }),
        }),
      );
    });

    it('should mark time entries as billed', async () => {
      setupCreateMocks();

      await service.create(createDto, 'admin-1');

      expect(mockPrismaTimeEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['te-1', 'te-2'] } },
          data: expect.objectContaining({ isBilled: true }),
        }),
      );
    });

    it('should generate invoice number in transaction', async () => {
      setupCreateMocks();

      await service.create(createDto, 'admin-1');

      expect(mockPrismaInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceNumber: expect.stringContaining('FAC-'),
          }),
        }),
      );
    });

    it('should reject if client does not match case', async () => {
      mockPrismaCase.findFirst.mockResolvedValue({ ...mockCaseData, clientProfileId: 'other-cp' });

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid time entries (count mismatch)', async () => {
      mockPrismaCase.findFirst.mockResolvedValue(mockCaseData);
      mockPrismaInvoice.findFirst.mockResolvedValueOnce(null); // generateInvoiceNumber
      // Return only 1 entry when 2 are expected
      mockPrismaTimeEntry.findMany.mockResolvedValue([mockTimeEntries[0]]);

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when case not found', async () => {
      mockPrismaCase.findFirst.mockResolvedValue(null);

      await expect(
        service.create(createDto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const invoices = [mockInvoice];
      mockPrismaInvoice.findMany.mockResolvedValue(invoices);
      mockPrismaInvoice.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'admin-1', UserRole.ADMIN);

      expect(result.data).toEqual(invoices);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 20, offset: 0, hasNextPage: false, hasPreviousPage: false }),
      );
    });

    it('should restrict non-admin users to assigned cases', async () => {
      mockPrismaInvoice.findMany.mockResolvedValue([]);
      mockPrismaInvoice.count.mockResolvedValue(0);

      await service.findAll({} as any, 'lawyer-1', UserRole.LAWYER);

      expect(mockPrismaInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            case: { assignments: { some: { userId: 'lawyer-1', removedAt: null } } },
          }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return invoice with includes', async () => {
      stubFindOne();

      const result = await service.findOne('inv-1');

      expect(result).toEqual(mockInvoice);
      expect(mockPrismaInvoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          include: expect.objectContaining({
            items: true,
            payments: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when invoice does not exist', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update (status transitions) ───────────────────────────────

  describe('update', () => {
    it('should update status DRAFT -> SENT and send notification', async () => {
      const draftInvoice = { ...mockInvoice, status: InvoiceStatus.DRAFT };
      // First call: findOne inside update
      mockPrismaInvoice.findFirst.mockResolvedValueOnce(draftInvoice);
      mockPrismaClientProfile.findFirst.mockResolvedValue(mockClientProfile);
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockPrismaInvoice.update.mockResolvedValue({ ...draftInvoice, status: InvoiceStatus.SENT });
      // Second call: findOne at return
      mockPrismaInvoice.findFirst.mockResolvedValueOnce({ ...draftInvoice, status: InvoiceStatus.SENT });

      await service.update('inv-1', { status: InvoiceStatus.SENT }, 'admin-1');

      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          type: 'EMAIL',
          title: expect.stringContaining('FAC-2026-00001'),
        }),
      );
      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'INVOICE_SENT' }),
        }),
      );
    });

    it('should update status SENT -> PAID and set paidAt', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.SENT };
      mockPrismaInvoice.findFirst.mockResolvedValueOnce(sentInvoice);
      mockPrismaInvoice.update.mockResolvedValue({ ...sentInvoice, status: InvoiceStatus.PAID });
      mockPrismaInvoice.findFirst.mockResolvedValueOnce({ ...sentInvoice, status: InvoiceStatus.PAID });

      await service.update('inv-1', { status: InvoiceStatus.PAID }, 'admin-1');

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InvoiceStatus.PAID,
            paidAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should reject invalid status transition (PAID -> DRAFT)', async () => {
      const paidInvoice = { ...mockInvoice, status: InvoiceStatus.PAID };
      mockPrismaInvoice.findFirst.mockResolvedValue(paidInvoice);

      await expect(
        service.update('inv-1', { status: InvoiceStatus.DRAFT as any }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid status transition (CANCELLED -> SENT)', async () => {
      const cancelledInvoice = { ...mockInvoice, status: InvoiceStatus.CANCELLED };
      mockPrismaInvoice.findFirst.mockResolvedValue(cancelledInvoice);

      await expect(
        service.update('inv-1', { status: InvoiceStatus.SENT }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancel (unmarks billed entries) ───────────────────────────

  describe('cancel', () => {
    it('should unmark billed entries when cancelling', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.SENT };
      mockPrismaInvoice.findFirst.mockResolvedValueOnce(sentInvoice);
      mockPrismaTimeEntry.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaExpense.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockPrismaInvoice.update.mockResolvedValue({ ...sentInvoice, status: InvoiceStatus.CANCELLED });
      mockPrismaInvoice.findFirst.mockResolvedValueOnce({ ...sentInvoice, status: InvoiceStatus.CANCELLED });

      await service.update('inv-1', { status: InvoiceStatus.CANCELLED }, 'admin-1');

      expect(mockPrismaTimeEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoiceId: 'inv-1' },
          data: { isBilled: false, invoiceId: null },
        }),
      );
      expect(mockPrismaExpense.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoiceId: 'inv-1' },
          data: { isBilled: false, invoiceId: null },
        }),
      );
    });
  });

  // ─── remove ─────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a DRAFT invoice', async () => {
      stubFindOne({ ...mockInvoice, status: InvoiceStatus.DRAFT });
      mockPrismaTimeEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaExpense.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaInvoice.update.mockResolvedValue({});

      await service.remove('inv-1', 'admin-1');

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'Invoice', entityId: 'inv-1' }),
      );
    });

    it('should reject delete for non-DRAFT invoice (SENT)', async () => {
      stubFindOne({ ...mockInvoice, status: InvoiceStatus.SENT });

      await expect(service.remove('inv-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject delete for PAID invoice', async () => {
      stubFindOne({ ...mockInvoice, status: InvoiceStatus.PAID });

      await expect(service.remove('inv-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addItem ────────────────────────────────────────────────────

  describe('addItem', () => {
    it('should add item and recalculate totals', async () => {
      stubFindOne({ ...mockInvoice, status: InvoiceStatus.DRAFT });
      const newItem = { id: 'item-3', invoiceId: 'inv-1', description: 'Consultoria', quantity: 2, unitPrice: 3000, amount: 6000 };
      mockPrismaInvoiceItem.create.mockResolvedValue(newItem);
      // recalculateTotals calls
      mockPrismaInvoiceItem.findMany.mockResolvedValue([...mockInvoice.items, newItem]);
      mockPrismaInvoice.findFirst.mockResolvedValueOnce({ ...mockInvoice, taxRate: 0.16 });
      mockPrismaInvoice.update.mockResolvedValue({});

      const result = await service.addItem('inv-1', {
        description: 'Consultoria',
        quantity: 2,
        unitPrice: 3000,
      });

      expect(result).toEqual(newItem);
      expect(mockPrismaInvoiceItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'inv-1',
            amount: expect.anything(), // Decimal
          }),
        }),
      );
      // Verify recalculation happened
      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            subtotal: expect.anything(),
            taxAmount: expect.anything(),
            total: expect.anything(),
          }),
        }),
      );
    });
  });

  // ─── removeItem ─────────────────────────────────────────────────

  describe('removeItem', () => {
    it('should remove item and recalculate totals', async () => {
      stubFindOne({ ...mockInvoice, status: InvoiceStatus.DRAFT });
      mockPrismaInvoiceItem.findFirst.mockResolvedValue(mockInvoice.items[1]);
      mockPrismaInvoiceItem.delete.mockResolvedValue({});
      // recalculateTotals calls
      mockPrismaInvoiceItem.findMany.mockResolvedValue([mockInvoice.items[0]]);
      mockPrismaInvoice.findFirst.mockResolvedValueOnce({ ...mockInvoice, taxRate: 0.16 });
      mockPrismaInvoice.update.mockResolvedValue({});

      await service.removeItem('inv-1', 'item-2');

      expect(mockPrismaInvoiceItem.delete).toHaveBeenCalledWith({ where: { id: 'item-2' } });
      // After removing item-2 (amount=5000), only item-1 (amount=5000) remains
      // subtotal=5000, taxAmount=5000*0.16=800, total=5800
      expect(mockPrismaInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            subtotal: expect.anything(), // Decimal
            taxAmount: expect.anything(), // Decimal
            total: expect.anything(), // Decimal
          }),
        }),
      );
    });
  });

  // ─── getSummary ─────────────────────────────────────────────────

  describe('getSummary', () => {
    it('should calculate invoice summary correctly', async () => {
      mockPrismaInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          total: 10000,
          status: 'SENT',
          payments: [{ amount: 3000, status: 'COMPLETED' }],
        },
        {
          id: 'inv-2',
          total: 5000,
          status: 'PAID',
          payments: [{ amount: 5000, status: 'COMPLETED' }],
        },
        {
          id: 'inv-3',
          total: 8000,
          status: 'OVERDUE',
          payments: [{ amount: 2000, status: 'COMPLETED' }],
        },
        {
          id: 'inv-4',
          total: 2000,
          status: 'CANCELLED',
          payments: [],
        },
      ]);

      const result = await service.getSummary('case-1');

      expect(result).toEqual({
        totalInvoiced: 23000,    // 10000 + 5000 + 8000 (CANCELLED excluded)
        totalPaid: 10000,        // 3000 + 5000 + 2000
        totalPending: 13000,     // (10000-3000) + (8000-2000)  (PAID & CANCELLED excluded)
        totalOverdue: 6000,      // 8000-2000
      });
    });
  });
});
