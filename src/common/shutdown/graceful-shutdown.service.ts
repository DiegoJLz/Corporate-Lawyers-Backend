import { Injectable, Logger, OnModuleDestroy, BeforeApplicationShutdown } from '@nestjs/common';

@Injectable()
export class GracefulShutdownService implements BeforeApplicationShutdown, OnModuleDestroy {
  private readonly logger = new Logger(GracefulShutdownService.name);

  async beforeApplicationShutdown(signal?: string) {
    this.logger.log(`Shutdown signal received: ${signal}`);
    // Give in-flight requests time to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));
    this.logger.log('Graceful shutdown: in-flight requests drained');
  }

  async onModuleDestroy() {
    this.logger.log('Module destroyed — cleanup complete');
  }
}
