import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { StorageService } from '../../../services/storage/storage.service';

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly storageService: StorageService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const connected = await this.storageService.checkConnection();
      if (!connected) {
        throw new Error('Storage bucket unreachable');
      }
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Storage check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
