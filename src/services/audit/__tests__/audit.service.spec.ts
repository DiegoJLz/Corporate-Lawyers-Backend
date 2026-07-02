import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../../core/database/prisma.service';

describe('AuditService', () => {
  let service: AuditService;

  const mockAuditLog = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };

  const mockPrisma = {
    auditLog: mockAuditLog,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      mockAuditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        userId: 'user-1',
        action: 'CREATE',
        entityType: 'Case',
        entityId: 'case-1',
      });

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'CREATE',
          entityType: 'Case',
          entityId: 'case-1',
        }),
      });
    });

    it('should not throw if database write fails', async () => {
      mockAuditLog.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.log({
          action: 'CREATE',
          entityType: 'Case',
        }),
      ).resolves.not.toThrow();
    });

    it('should handle nullable userId for system actions', async () => {
      mockAuditLog.create.mockResolvedValue({ id: 'log-2' });

      await service.log({
        action: 'SYSTEM_CLEANUP',
        entityType: 'Session',
      });

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: undefined,
          action: 'SYSTEM_CLEANUP',
          entityType: 'Session',
        }),
      });
    });

    it('should store old and new values as JSON', async () => {
      mockAuditLog.create.mockResolvedValue({ id: 'log-3' });

      await service.log({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'User',
        entityId: 'user-2',
        oldValue: { status: 'ACTIVE' },
        newValue: { status: 'SUSPENDED' },
      });

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValue: { status: 'ACTIVE' },
          newValue: { status: 'SUSPENDED' },
        }),
      });
    });
  });

  describe('findAll', () => {
    const mockLogs = [
      { id: 'log-1', action: 'CREATE', entityType: 'Case', createdAt: new Date() },
      { id: 'log-2', action: 'UPDATE', entityType: 'Case', createdAt: new Date() },
    ];

    it('should return paginated audit logs', async () => {
      mockAuditLog.findMany.mockResolvedValue(mockLogs);
      mockAuditLog.count.mockResolvedValue(2);

      const result = await service.findAll({ limit: 20, offset: 0 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.hasNextPage).toBe(false);
    });

    it('should filter by userId', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: 'user-1' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      const from = new Date('2026-01-01');
      const to = new Date('2026-06-01');

      await service.findAll({ from, to });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('should filter by entityType and action', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.findAll({ entityType: 'Case', action: 'DELETE' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'Case',
            action: 'DELETE',
          }),
        }),
      );
    });

    it('should indicate hasNextPage correctly', async () => {
      mockAuditLog.findMany.mockResolvedValue(mockLogs);
      mockAuditLog.count.mockResolvedValue(50);

      const result = await service.findAll({ limit: 20, offset: 0 });

      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(false);
    });
  });
});
