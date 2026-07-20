import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultLevel = isProduction ? 'info' : 'debug';
    const level = process.env.LOG_LEVEL ?? defaultLevel;

    const prodFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    );

    const devFormat = winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level: lvl, message, context, ...meta }) => {
        const ctx = context ? `[${context}] ` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${lvl} ${ctx}${message}${metaStr}`;
      }),
    );

    this.logger = winston.createLogger({
      level,
      format: isProduction ? prodFormat : devFormat,
      transports: [new winston.transports.Console()],
    });
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  logWithMeta(level: string, message: string, meta: Record<string, unknown>): void {
    this.logger.log(level, message, meta);
  }
}
