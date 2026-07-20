import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');

    let client: Redis | undefined;
    try {
      client = new Redis({
        host,
        port,
        password: password || undefined,
        connectTimeout: 3000,
        lazyConnect: true,
      });

      await client.connect();
      await client.ping();
      await client.disconnect();

      return this.getStatus(key, true);
    } catch (error) {
      if (client) {
        try {
          await client.disconnect();
        } catch {
          // ignore disconnect errors
        }
      }
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
