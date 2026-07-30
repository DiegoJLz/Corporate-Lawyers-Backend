import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { UserRole } from '@prisma/client';
import { Public } from '../../core/security/decorators/public.decorator';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly storage: StorageHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  liveness() {
    return this.health.check([
      () => this.db.isHealthy('database'),
    ]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
      () => this.storage.isHealthy('storage'),
    ]);
  }

  @Get('detailed')
  @Roles(UserRole.ADMIN)
  @HealthCheck()
  detailed() {
    return this.health.check([
      () => this.db.responseTime('database'),
      () => this.redis.isHealthy('redis'),
      () => this.storage.isHealthy('storage'),
    ]);
  }
}
