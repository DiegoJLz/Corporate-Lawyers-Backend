import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppCacheService } from './cache.service';

@Global()
@Module({
  imports: [
    CacheModule.register({
      ttl: 300000,
    }),
  ],
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class AppCacheModule {}
