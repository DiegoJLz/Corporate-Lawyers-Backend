import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }

  async responseTime(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;
      return this.getStatus(key, true, { responseTimeMs: duration });
    } catch (error) {
      const duration = Date.now() - start;
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, {
          responseTimeMs: duration,
          message: (error as Error).message,
        }),
      );
    }
  }
}
