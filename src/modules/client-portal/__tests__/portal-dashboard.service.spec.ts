import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PortalDashboardService } from '../portal-dashboard.service';
import { PrismaService } from '../../../core/database/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockClientProfile = { id: 'cp-1', userId: 'client-1' };

const mockCases = [
  { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Case A', type: 'CIVIL', status: 'ACTIVE', priority: 'HIGH', startDate: NOW, updatedAt: NOW },
  { id: 'case-2', caseNumber: 'CORP-2026-00002', title: 'Case B', type: 'PENAL', status: 'INTAKE', priority: 'MEDIUM', startDate: NOW, updatedAt: NOW },
];

const mockTimeline = [
  { id: 'tl-1', caseId: 'case-1', eventType: 'CASE_CREATED', title: 'Created', description: null, createdAt: NOW, case: { caseNumber: 'CORP-2026-00001', title: 'Case A' } },
];

const mockPendingInvoices = [
  { id: 'inv-1', invoiceNumber: 'INV-001', total: new Decimal('5000.00'), status: 'SENT', dueDate: NOW },
  { id: 'inv-2', invoiceNumber: 'INV-002', total: new Decimal('3000.50'), status: 'OVERDUE', dueDate: NOW },
];

const mockUpcomingEvents = [
  { id: 'ev-1', title: 'Hearing', type: 'HEARING', startDate: NOW, endDate: NOW, location: 'Court', virtualUrl: null, isAllDay: false },
];

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

describe('PortalDashboardService', () => {
  let service: PortalDashboardService;

  const mockPrismaClientProfile = createMockModel();
  const mockPrismaCase = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();
  const mockPrismaInvoice = createMockModel();
  const mockPrismaClientMessage = createMockModel();
  const mockPrismaEvent = createMockModel();
  const mockPrismaNotification = createMockModel();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalDashboardService,
        {
          provide: PrismaService,
          useValue: {
            get clientProfile() { return mockPrismaClientProfile; },
            get case() { return mockPrismaCase; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
            get invoice() { return mockPrismaInvoice; },
            get clientMessage() { return mockPrismaClientMessage; },
            get event() { return mockPrismaEvent; },
            get notification() { return mockPrismaNotification; },
          },
        },
      ],
    }).compile();

    service = module.get<PortalDashboardService>(PortalDashboardService);
  });

  function stubFullDashboard() {
    mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
    mockPrismaCase.findMany.mockResolvedValue(mockCases);
    mockPrismaCaseTimeline.findMany.mockResolvedValue(mockTimeline);
    mockPrismaInvoice.findMany.mockResolvedValue(mockPendingInvoices);
    mockPrismaClientMessage.count.mockResolvedValue(3);
    mockPrismaEvent.findMany.mockResolvedValue(mockUpcomingEvents);
    mockPrismaNotification.count.mockResolvedValue(7);
  }

  // ─── getDashboard ─────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should return dashboard with full data', async () => {
      stubFullDashboard();

      const result = await service.getDashboard('client-1');

      expect(result.cases.total).toBe(2);
      expect(result.cases.active).toBe(1);
      expect(result.cases.recent).toHaveLength(2);
      expect(result.timeline).toEqual(mockTimeline);
      expect(result.billing.pendingInvoices).toBe(2);
      expect(result.unreadMessages).toBe(3);
      expect(result.upcomingEvents).toEqual(mockUpcomingEvents);
      expect(result.unreadNotifications).toBe(7);
    });

    it('should throw NotFoundException when client profile does not exist', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);

      await expect(service.getDashboard('no-profile-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return dashboard with zero cases', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(mockClientProfile);
      mockPrismaCase.findMany.mockResolvedValue([]);
      mockPrismaCaseTimeline.findMany.mockResolvedValue([]);
      mockPrismaInvoice.findMany.mockResolvedValue([]);
      mockPrismaClientMessage.count.mockResolvedValue(0);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaNotification.count.mockResolvedValue(0);

      const result = await service.getDashboard('client-1');

      expect(result.cases.total).toBe(0);
      expect(result.cases.active).toBe(0);
      expect(result.cases.recent).toEqual([]);
      expect(result.billing.pendingInvoices).toBe(0);
      expect(result.billing.totalPending).toBe('0.00');
      expect(result.billing.totalOverdue).toBe('0.00');
    });

    it('should calculate financial totals correctly with Decimal', async () => {
      stubFullDashboard();

      const result = await service.getDashboard('client-1');

      // totalPending = 5000.00 + 3000.50 = 8000.50
      expect(result.billing.totalPending).toBe('8000.50');
      // totalOverdue = only OVERDUE invoices = 3000.50
      expect(result.billing.totalOverdue).toBe('3000.50');
    });

    it('should return unread messages count', async () => {
      stubFullDashboard();

      const result = await service.getDashboard('client-1');

      expect(result.unreadMessages).toBe(3);
      expect(mockPrismaClientMessage.count).toHaveBeenCalledWith({
        where: { receiverId: 'client-1', readAt: null },
      });
    });

    it('should return upcoming events filtered by future date', async () => {
      stubFullDashboard();

      const result = await service.getDashboard('client-1');

      expect(result.upcomingEvents).toEqual(mockUpcomingEvents);
      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            attendees: { some: { userId: 'client-1' } },
            startDate: { gte: expect.any(Date) },
            deletedAt: null,
          }),
          take: 5,
        }),
      );
    });

    it('should return unread notifications count', async () => {
      stubFullDashboard();

      const result = await service.getDashboard('client-1');

      expect(result.unreadNotifications).toBe(7);
      expect(mockPrismaNotification.count).toHaveBeenCalledWith({
        where: { userId: 'client-1', readAt: null },
      });
    });
  });
});
