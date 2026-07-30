import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PortalInvoicesService } from '../portal-invoices.service';
import { PrismaService } from '../../../core/database/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockClientProfile = { id: 'cp-1' };

const mockInvoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-001',
  clientProfileId: 'cp-1',
  caseId: 'case-1',
  total: new Decimal('10000.00'),
  status: InvoiceStatus.SENT,
  dueDate: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Case A' },
  _count: { items: 3, payments: 1 },
};

const mockInvoiceWithPayments = {
  ...mockInvoice,
  items: [
    { id: 'item-1', description: 'Legal fees', amount: new Decimal('10000.00') },
  ],
  payments: [
    { id: 'pay-1', amount: new Decimal('3000.00'), paidAt: NOW, status: 'COMPLETED' },
    { id: 'pay-2', amount: new Decimal('2000.00'), paidAt: NOW, status: 'COMPLETED' },
  ],
};

const mockDraftInvoice = {
  ...mockInvoice,
  id: 'inv-draft',
  status: InvoiceStatus.DRAFT,
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

describe('PortalInvoicesService', () => {
  let service: PortalInvoicesService;

  const mockPrismaClientProfile = createMockModel();
  const mockPrismaInvoice = createMockModel();
  const mockPrismaPayment = createMockModel();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalInvoicesService,
        {
          provide: PrismaService,
          useValue: {
            get clientProfile() { return mockPrismaClientProfile; },
            get invoice() { return mockPrismaInvoice; },
            get payment() { return mockPrismaPayment; },
          },
        },
      ],
    }).compile();

    service = module.get<PortalInvoicesService>(PortalInvoicesService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should exclude DRAFT invoices', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findMany.mockResolvedValue([mockInvoice]);
      mockPrismaInvoice.count.mockResolvedValue(1);

      const result = await service.findAll({} as any, 'client-1');

      expect(result.data).toEqual([{ ...mockInvoice, currency: 'MXN' }]);
      expect(mockPrismaInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: InvoiceStatus.DRAFT },
          }),
        }),
      );
    });

    it('should only return invoices belonging to the client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findMany.mockResolvedValue([]);
      mockPrismaInvoice.count.mockResolvedValue(0);

      await service.findAll({} as any, 'client-1');

      expect(mockPrismaInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientProfileId: 'cp-1',
          }),
        }),
      );
    });

    it('should return empty result when no client profile exists', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      const result = await service.findAll({ limit: 20, offset: 0 } as any, 'client-1');

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should not allow filtering by DRAFT status even if requested', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findMany.mockResolvedValue([]);
      mockPrismaInvoice.count.mockResolvedValue(0);

      await service.findAll({ status: InvoiceStatus.DRAFT } as any, 'client-1');

      // The status filter should NOT be set to DRAFT; it stays as { not: DRAFT }
      expect(mockPrismaInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: InvoiceStatus.DRAFT },
          }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return invoice with pending amount calculated from Decimal', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findFirst.mockResolvedValue(mockInvoiceWithPayments);

      const result = await service.findOne('inv-1', 'client-1');

      // totalPaid = 3000 + 2000 = 5000
      expect(result.totalPaid).toBe(5000);
      // pendingAmount = 10000 - 5000 = 5000
      expect(result.pendingAmount).toBe(5000);
    });

    it('should throw NotFoundException when invoice is DRAFT', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      // findFirst returns null because status != DRAFT is in the where
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('inv-draft', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when invoice belongs to another client', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('inv-other', 'client-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when client profile does not exist', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inv-1', 'no-profile')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSummary ───────────────────────────────────────────────

  describe('getSummary', () => {
    it('should calculate totals with Decimal correctly', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          total: new Decimal('10000.00'),
          status: InvoiceStatus.SENT,
          payments: [
            { amount: new Decimal('3000.00'), status: 'COMPLETED' },
          ],
        },
        {
          id: 'inv-2',
          total: new Decimal('5000.00'),
          status: InvoiceStatus.OVERDUE,
          payments: [
            { amount: new Decimal('1000.00'), status: 'COMPLETED' },
          ],
        },
        {
          id: 'inv-3',
          total: new Decimal('8000.00'),
          status: InvoiceStatus.PAID,
          payments: [
            { amount: new Decimal('8000.00'), status: 'COMPLETED' },
          ],
        },
      ]);

      const result = await service.getSummary('client-1');

      // totalInvoiced = 10000 + 5000 + 8000 = 23000
      expect(result.totalInvoiced).toBe(23000);
      // totalPaid = 3000 + 1000 + 8000 = 12000
      expect(result.totalPaid).toBe(12000);
      // totalPending = (10000-3000) + (5000-1000) = 7000+4000 = 11000 (SENT and OVERDUE are not PAID)
      expect(result.totalPending).toBe(11000);
      // totalOverdue = 5000 - 1000 = 4000 (only OVERDUE invoices)
      expect(result.totalOverdue).toBe(4000);
    });

    it('should return zeros when client has no profile', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      const result = await service.getSummary('no-profile');

      expect(result).toEqual({
        totalInvoiced: 0,
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
      });
    });

    it('should exclude DRAFT and CANCELLED invoices from summary', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaInvoice.findMany.mockResolvedValue([]);

      await service.getSummary('client-1');

      expect(mockPrismaInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED],
            },
          }),
        }),
      );
    });
  });
});
