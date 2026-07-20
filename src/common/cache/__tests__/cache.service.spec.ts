import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AppCacheService } from '../cache.service';

describe('AppCacheService', () => {
  let service: AppCacheService;
  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppCacheService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<AppCacheService>(AppCacheService);
  });

  it('should return cached value on get() hit', async () => {
    mockCacheManager.get.mockResolvedValue({ id: 1, name: 'cached' });

    const result = await service.get('my-key');

    expect(mockCacheManager.get).toHaveBeenCalledWith('my-key');
    expect(result).toEqual({ id: 1, name: 'cached' });
  });

  it('should return undefined on get() miss', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);

    const result = await service.get('missing-key');

    expect(result).toBeUndefined();
  });

  it('should call cache.set with TTL converted to milliseconds', async () => {
    mockCacheManager.set.mockResolvedValue(undefined);

    await service.set('key', 'value', 60);

    expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', 60000);
  });

  it('should call cache.set with undefined TTL when not provided', async () => {
    mockCacheManager.set.mockResolvedValue(undefined);

    await service.set('key', 'value');

    expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', undefined);
  });

  it('should call cache.del on del()', async () => {
    mockCacheManager.del.mockResolvedValue(undefined);

    await service.del('key-to-delete');

    expect(mockCacheManager.del).toHaveBeenCalledWith('key-to-delete');
  });

  it('should return cached value on getOrSet() hit without calling factory', async () => {
    mockCacheManager.get.mockResolvedValue('existing-value');
    const factory = jest.fn();

    const result = await service.getOrSet('key', factory, 30);

    expect(result).toBe('existing-value');
    expect(factory).not.toHaveBeenCalled();
    expect(mockCacheManager.set).not.toHaveBeenCalled();
  });

  it('should call factory and cache result on getOrSet() miss', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockCacheManager.set.mockResolvedValue(undefined);
    const factory = jest.fn().mockResolvedValue('new-value');

    const result = await service.getOrSet('key', factory, 120);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'new-value', 120000);
    expect(result).toBe('new-value');
  });

  it('should call factory when cached value is null on getOrSet()', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(undefined);
    const factory = jest.fn().mockResolvedValue('fresh-value');

    const result = await service.getOrSet('key', factory, 60);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(result).toBe('fresh-value');
  });
});
