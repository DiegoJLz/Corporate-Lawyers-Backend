import { ServiceUnavailableException } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30000;
  }

  async execute<T>(
    action: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        if (fallback) {
          return fallback();
        }
        throw new ServiceUnavailableException(
          `Circuit breaker "${this.name}" is open`,
        );
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
