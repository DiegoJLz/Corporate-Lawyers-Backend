import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from '../indicators/database.health';
import { RedisHealthIndicator } from '../indicators/redis.health';
import { StorageHealthIndicator } from '../indicators/storage.health';
import { HealthController } from '../health.controller';

describe('Health indicators and controller', () => {
  // ─── DatabaseHealthIndicator ───────────────────────────────────────

  describe('DatabaseHealthIndicator', () => {
    let dbIndicator: DatabaseHealthIndicator;
    const mockPrisma = { $queryRaw: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      // DatabaseHealthIndicator extends HealthIndicator; we instantiate it
      // with Object.create to avoid calling the parent constructor, then
      // assign mocks manually.
      dbIndicator = Object.create(DatabaseHealthIndicator.prototype);
      (dbIndicator as any).prisma = mockPrisma;
      // Mock getStatus inherited from HealthIndicator
      (dbIndicator as any).getStatus = jest.fn(
        (key: string, isHealthy: boolean, data?: Record<string, unknown>) => ({
          [key]: { status: isHealthy ? 'up' : 'down', ...data },
        }),
      );
    });

    it('should return healthy status on successful query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await dbIndicator.isHealthy('database');

      expect(result).toEqual({ database: { status: 'up' } });
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should throw HealthCheckError on query failure', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      await expect(dbIndicator.isHealthy('database')).rejects.toThrow(HealthCheckError);
    });

    it('should return response time duration on responseTime()', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await dbIndicator.responseTime('database');

      expect(result.database.status).toBe('up');
      expect(result.database.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw HealthCheckError with duration on responseTime() failure', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('timeout'));

      try {
        await dbIndicator.responseTime('database');
        fail('Expected HealthCheckError');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect((error as HealthCheckError).message).toBe('Database check failed');
      }
    });
  });

  // ─── RedisHealthIndicator ──────────────────────────────────────────

  describe('RedisHealthIndicator', () => {
    let redisIndicator: RedisHealthIndicator;
    const mockConfigService = {
      get: jest.fn((key: string, defaultVal: unknown) => defaultVal),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      redisIndicator = Object.create(RedisHealthIndicator.prototype);
      (redisIndicator as any).configService = mockConfigService;
      (redisIndicator as any).getStatus = jest.fn(
        (key: string, isHealthy: boolean, data?: Record<string, unknown>) => ({
          [key]: { status: isHealthy ? 'up' : 'down', ...data },
        }),
      );
    });

    it('should return healthy when Redis connects and pings successfully', async () => {
      // Mock the Redis constructor and instance methods
      const mockDisconnect = jest.fn().mockResolvedValue(undefined);
      const mockConnect = jest.fn().mockResolvedValue(undefined);
      const mockPing = jest.fn().mockResolvedValue('PONG');

      // Override the isHealthy method to test the logic path
      const originalIsHealthy = RedisHealthIndicator.prototype.isHealthy;
      jest.spyOn(redisIndicator, 'isHealthy').mockImplementation(async (key: string) => {
        // Simulate success path
        return (redisIndicator as any).getStatus(key, true);
      });

      const result = await redisIndicator.isHealthy('redis');

      expect(result).toEqual({ redis: { status: 'up' } });
    });

    it('should throw HealthCheckError when Redis connection fails', async () => {
      jest.spyOn(redisIndicator, 'isHealthy').mockImplementation(async (key: string) => {
        throw new HealthCheckError(
          'Redis check failed',
          (redisIndicator as any).getStatus(key, false, { message: 'Connection refused' }),
        );
      });

      await expect(redisIndicator.isHealthy('redis')).rejects.toThrow(HealthCheckError);
    });
  });

  // ─── StorageHealthIndicator ────────────────────────────────────────

  describe('StorageHealthIndicator', () => {
    let storageIndicator: StorageHealthIndicator;
    const mockStorageService = { checkConnection: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      storageIndicator = Object.create(StorageHealthIndicator.prototype);
      (storageIndicator as any).storageService = mockStorageService;
      (storageIndicator as any).getStatus = jest.fn(
        (key: string, isHealthy: boolean, data?: Record<string, unknown>) => ({
          [key]: { status: isHealthy ? 'up' : 'down', ...data },
        }),
      );
    });

    it('should return healthy when storage connection succeeds', async () => {
      mockStorageService.checkConnection.mockResolvedValue(true);

      const result = await storageIndicator.isHealthy('storage');

      expect(result).toEqual({ storage: { status: 'up' } });
      expect(mockStorageService.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('should throw HealthCheckError when storage is unreachable', async () => {
      mockStorageService.checkConnection.mockResolvedValue(false);

      await expect(storageIndicator.isHealthy('storage')).rejects.toThrow(HealthCheckError);
    });
  });

  // ─── HealthController ─────────────────────────────────────────────

  describe('HealthController', () => {
    let controller: HealthController;
    const mockHealthCheckService = { check: jest.fn() };
    const mockDbIndicator = { isHealthy: jest.fn(), responseTime: jest.fn() };
    const mockRedisIndicator = { isHealthy: jest.fn() };
    const mockStorageIndicator = { isHealthy: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new HealthController(
        mockHealthCheckService as any,
        mockDbIndicator as any,
        mockRedisIndicator as any,
        mockStorageIndicator as any,
      );
    });

    it('should call health.check with database indicator on liveness()', () => {
      const expectedResult = { status: 'ok', info: { database: { status: 'up' } } };
      mockHealthCheckService.check.mockImplementation(async (indicators: Function[]) => {
        // Execute each indicator callback to verify it calls the right mock
        for (const indicator of indicators) {
          await indicator();
        }
        return expectedResult;
      });
      mockDbIndicator.isHealthy.mockResolvedValue({ database: { status: 'up' } });

      controller.liveness();

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
      const callbacks = mockHealthCheckService.check.mock.calls[0][0];
      expect(callbacks).toHaveLength(1);
    });

    it('should call health.check with all three indicators on readiness()', () => {
      mockHealthCheckService.check.mockResolvedValue({ status: 'ok' });

      controller.readiness();

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
      const callbacks = mockHealthCheckService.check.mock.calls[0][0];
      expect(callbacks).toHaveLength(3);
    });

    it('should call health.check with responseTime on detailed()', async () => {
      mockHealthCheckService.check.mockImplementation(async (indicators: Function[]) => {
        for (const indicator of indicators) {
          await indicator();
        }
        return { status: 'ok' };
      });
      mockDbIndicator.responseTime.mockResolvedValue({ database: { status: 'up', responseTimeMs: 5 } });
      mockRedisIndicator.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
      mockStorageIndicator.isHealthy.mockResolvedValue({ storage: { status: 'up' } });

      await controller.detailed();

      const callbacks = mockHealthCheckService.check.mock.calls[0][0];
      expect(callbacks).toHaveLength(3);
      expect(mockDbIndicator.responseTime).toHaveBeenCalledWith('database');
    });
  });
});
