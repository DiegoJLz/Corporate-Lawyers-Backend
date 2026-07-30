import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AppCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : undefined;
    await this.cacheManager.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const store = (this.cacheManager as any).store;
      if (store.keys) {
        const keys = await store.keys(pattern);
        if (keys?.length > 0) {
          await Promise.all(keys.map((key: string) => this.cacheManager.del(key)));
        }
      }
    } catch {
      // In-memory store may not support keys() — silently ignore
    }
  }
}
