import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const cb = new CircuitBreaker('test');

    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should remain CLOSED after a successful action', async () => {
    const cb = new CircuitBreaker('test');
    const action = jest.fn().mockResolvedValue('ok');

    const result = await cb.execute(action);

    expect(result).toBe('ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should remain CLOSED after a single failure (below threshold)', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(cb.execute(failingAction)).rejects.toThrow('fail');

    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should transition to OPEN after reaching failureThreshold', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('should reject immediately with ServiceUnavailableException when OPEN', async () => {
    const cb = new CircuitBreaker('test-svc', { failureThreshold: 2, recoveryTimeoutMs: 60000 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow();
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Next call should throw ServiceUnavailableException without calling the action
    const freshAction = jest.fn().mockResolvedValue('should not run');
    await expect(cb.execute(freshAction)).rejects.toThrow(ServiceUnavailableException);
    expect(freshAction).not.toHaveBeenCalled();
  });

  it('should call fallback when OPEN and fallback is provided', async () => {
    const cb = new CircuitBreaker('test-fb', { failureThreshold: 2, recoveryTimeoutMs: 60000 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));
    const fallback = jest.fn().mockResolvedValue('fallback-value');

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow();
    }

    // Fallback should be used
    const result = await cb.execute(jest.fn(), fallback);

    expect(result).toBe('fallback-value');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('should transition to HALF_OPEN after recoveryTimeout elapses', async () => {
    const cb = new CircuitBreaker('test-half', { failureThreshold: 2, recoveryTimeoutMs: 100 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow();
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Wait for recovery timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Execute a successful action to trigger the HALF_OPEN transition
    const successAction = jest.fn().mockResolvedValue('recovered');
    const result = await cb.execute(successAction);

    // The circuit should have transitioned through HALF_OPEN and back to CLOSED
    expect(result).toBe('recovered');
    expect(successAction).toHaveBeenCalledTimes(1);
  });

  it('should reset to CLOSED on success in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker('test-reset', { failureThreshold: 2, recoveryTimeoutMs: 100 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow();
    }

    // Wait for recovery
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Succeed in HALF_OPEN
    const successAction = jest.fn().mockResolvedValue('ok');
    await cb.execute(successAction);

    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reopen to OPEN on failure in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker('test-reopen', { failureThreshold: 2, recoveryTimeoutMs: 100 });
    const failingAction = jest.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingAction)).rejects.toThrow();
    }

    // Wait for recovery
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Fail again in HALF_OPEN -> should reopen
    await expect(cb.execute(failingAction)).rejects.toThrow('fail');

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });
});
