import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';
import { StorageModule } from '../../services/storage/storage.module';

@Module({
  imports: [TerminusModule, StorageModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    StorageHealthIndicator,
  ],
})
export class HealthModule {}
