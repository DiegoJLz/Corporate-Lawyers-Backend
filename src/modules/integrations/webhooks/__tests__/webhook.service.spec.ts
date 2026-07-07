import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookService } from '../webhook.service';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WEBHOOK_QUEUE } from '../../../../services/queue/queue.constants';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockEndpoint = {
  id: 'wh-1',
  url: 'https://example.com/webhook',
  secret: 'a'.repeat(64),
  events: ['case.updated', 'document.signed'],
  isActive: true,
  description: 'Test webhook',
  createdById: 'user-1',
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockEndpoint2 = {
  ...mockEndpoint,
  id: 'wh-2',
  url: 'https://other.com/webhook',
  secret: 'b'.repeat(64),
  events: ['case.updated'],
  isActive: true,
};

const mockInactiveEndpoint = {
  ...mockEndpoint,
  id: 'wh-3',
  isActive: false,
};

const mockDelivery = {
  id: 'del-1',
  endpointId: 'wh-1',
  event: 'case.updated',
  payload: { caseId: 'case-1' },
  responseStatus: 200,
  responseBody: 'ok',
  success: true,
  createdAt: NOW,
};

const createDto = {
  url: 'https://example.com/webhook',
  events: ['case.updated', 'document.signed'],
  description: 'Test webhook',
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebhookService', () => {
  let service: WebhookService;

  const mockPrismaWebhookEndpoint = createMockModel();
  const mockPrismaWebhookDelivery = createMockModel();

  const mockDispatcher = {
    dispatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: PrismaService,
          useValue: {
            get webhookEndpoint() { return mockPrismaWebhookEndpoint; },
            get webhookDelivery() { return mockPrismaWebhookDelivery; },
          },
        },
        {
          provide: WebhookDispatcherService,
          useValue: mockDispatcher,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('should generate a secret when creating an endpoint', async () => {
      mockPrismaWebhookEndpoint.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'wh-new',
          ...args.data,
          isActive: true,
          deletedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );

      const result = await service.create(createDto, 'user-1');

      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBe(64); // 32 bytes hex = 64 chars
    });

    it('should store the endpoint with url, events, and description', async () => {
      mockPrismaWebhookEndpoint.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'wh-new',
          ...args.data,
          isActive: true,
          deletedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );

      const result = await service.create(createDto, 'user-1');

      expect(mockPrismaWebhookEndpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: 'https://example.com/webhook',
            events: ['case.updated', 'document.signed'],
            description: 'Test webhook',
            createdById: 'user-1',
            secret: expect.any(String),
          }),
        }),
      );
      expect(result.url).toBe('https://example.com/webhook');
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should NOT return secret in list responses', async () => {
      // The findAll uses a select that excludes secret
      mockPrismaWebhookEndpoint.findMany.mockResolvedValue([
        {
          id: 'wh-1',
          url: 'https://example.com/webhook',
          events: ['case.updated'],
          isActive: true,
          description: 'Test',
          createdById: 'user-1',
          createdAt: NOW,
          updatedAt: NOW,
          _count: { deliveries: 5 },
        },
      ]);
      mockPrismaWebhookEndpoint.count.mockResolvedValue(1);

      const result = await service.findAll({} as any);

      // Verify findMany was called with select (not include) and without secret
      expect(mockPrismaWebhookEndpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            url: true,
            events: true,
            isActive: true,
          }),
        }),
      );
      // The select object should NOT contain secret: true
      const callArgs = mockPrismaWebhookEndpoint.findMany.mock.calls[0][0];
      expect(callArgs.select.secret).toBeUndefined();

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return endpoint including secret on single-get', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);

      const result = await service.findOne('wh-1');

      expect(result.secret).toBe('a'.repeat(64));
      expect(result.id).toBe('wh-1');
    });

    it('should throw NotFoundException for missing endpoint', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('should toggle isActive', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockPrismaWebhookEndpoint.update.mockResolvedValue({
        ...mockEndpoint,
        isActive: false,
      });

      const result = await service.update('wh-1', { isActive: false });

      expect(mockPrismaWebhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({
            isActive: false,
          }),
        }),
      );
      expect(result.isActive).toBe(false);
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete by setting deletedAt', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockPrismaWebhookEndpoint.update.mockResolvedValue({
        ...mockEndpoint,
        deletedAt: NOW,
      });

      await service.remove('wh-1');

      expect(mockPrismaWebhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException when endpoint does not exist', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── testPing ─────────────────────────────────────────────────

  describe('testPing', () => {
    it('should dispatch a ping event via the dispatcher', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockDispatcher.dispatch.mockResolvedValue(undefined);

      const result = await service.testPing('wh-1');

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        'ping',
        expect.objectContaining({
          message: 'Webhook test ping',
          endpointId: 'wh-1',
          timestamp: expect.any(String),
        }),
      );
      expect(result.message).toBe('Ping dispatched');
    });
  });

  // ─── getDeliveries ────────────────────────────────────────────

  describe('getDeliveries', () => {
    it('should return paginated deliveries for an endpoint', async () => {
      mockPrismaWebhookEndpoint.findFirst.mockResolvedValue(mockEndpoint);
      mockPrismaWebhookDelivery.findMany.mockResolvedValue([mockDelivery]);
      mockPrismaWebhookDelivery.count.mockResolvedValue(1);

      const result = await service.getDeliveries('wh-1', {
        limit: 20,
        offset: 0,
      } as any);

      expect(result.data).toEqual([mockDelivery]);
      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 1,
          limit: 20,
          offset: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );
    });
  });
});

// ─── WebhookDispatcherService ─────────────────────────────────────

describe('WebhookDispatcherService', () => {
  let dispatcher: WebhookDispatcherService;

  const mockPrismaWebhookEndpoint = createMockModel();

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDispatcherService,
        {
          provide: PrismaService,
          useValue: {
            get webhookEndpoint() { return mockPrismaWebhookEndpoint; },
          },
        },
        {
          provide: getQueueToken(WEBHOOK_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    dispatcher = module.get<WebhookDispatcherService>(WebhookDispatcherService);
  });

  describe('dispatch', () => {
    it('should find matching active endpoints and enqueue jobs', async () => {
      mockPrismaWebhookEndpoint.findMany.mockResolvedValue([
        mockEndpoint,
        mockEndpoint2,
      ]);
      mockQueue.add.mockResolvedValue({});

      await dispatcher.dispatch('case.updated', { caseId: 'case-1' });

      expect(mockPrismaWebhookEndpoint.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          deletedAt: null,
          events: { has: 'case.updated' },
        },
      });
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          endpointId: 'wh-1',
          endpointUrl: 'https://example.com/webhook',
          endpointSecret: 'a'.repeat(64),
          event: 'case.updated',
          payload: { caseId: 'case-1' },
        }),
      );
    });

    it('should not enqueue when no active endpoints match (inactive ignored)', async () => {
      mockPrismaWebhookEndpoint.findMany.mockResolvedValue([]);
      mockQueue.add.mockResolvedValue({});

      await dispatcher.dispatch('case.updated', { caseId: 'case-1' });

      // The query filters isActive:true, so inactive endpoints are excluded by the DB
      expect(mockPrismaWebhookEndpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should not enqueue when no endpoints are subscribed to the event', async () => {
      mockPrismaWebhookEndpoint.findMany.mockResolvedValue([]);
      mockQueue.add.mockResolvedValue({});

      await dispatcher.dispatch('invoice.paid', { invoiceId: 'inv-1' });

      // The query filters events: { has: 'invoice.paid' }, so unsubscribed endpoints are excluded
      expect(mockPrismaWebhookEndpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: 'invoice.paid' },
          }),
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
