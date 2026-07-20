import * as winston from 'winston';
import { AppLoggerService } from '../logger.service';

// Mock winston.createLogger to return a mock logger instance
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    log: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      printf: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
    },
    __mockLogger: mockLogger,
  };
});

describe('AppLoggerService', () => {
  let service: AppLoggerService;
  let mockLogger: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppLoggerService();
    mockLogger = (winston as unknown as { __mockLogger: Record<string, jest.Mock> }).__mockLogger;
  });

  it('should call winston.info when log() is called', () => {
    service.log('test message', 'TestContext');

    expect(mockLogger.info).toHaveBeenCalledWith('test message', { context: 'TestContext' });
  });

  it('should call winston.error with trace when error() is called', () => {
    service.error('error message', 'stack trace here', 'ErrorContext');

    expect(mockLogger.error).toHaveBeenCalledWith('error message', {
      trace: 'stack trace here',
      context: 'ErrorContext',
    });
  });

  it('should call winston.warn when warn() is called', () => {
    service.warn('warning message', 'WarnContext');

    expect(mockLogger.warn).toHaveBeenCalledWith('warning message', { context: 'WarnContext' });
  });

  it('should call winston.debug when debug() is called', () => {
    service.debug('debug message', 'DebugContext');

    expect(mockLogger.debug).toHaveBeenCalledWith('debug message', { context: 'DebugContext' });
  });

  it('should pass metadata to winston when logWithMeta() is called', () => {
    const meta = { userId: 'user-1', action: 'login', ip: '127.0.0.1' };

    service.logWithMeta('info', 'user action', meta);

    expect(mockLogger.log).toHaveBeenCalledWith('info', 'user action', meta);
  });

  it('should call winston.verbose when verbose() is called', () => {
    service.verbose('verbose message', 'VerboseCtx');

    expect(mockLogger.verbose).toHaveBeenCalledWith('verbose message', { context: 'VerboseCtx' });
  });
});
