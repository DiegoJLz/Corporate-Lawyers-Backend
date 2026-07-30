import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AppLoggerService } from '../logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url } = request;
    const requestId: string | undefined = (request as any).requestId;
    const userId: string | undefined = request.user?.userId;
    const ip = Array.isArray(request.ip) ? request.ip[0] : (request.ip || request.headers?.['x-forwarded-for']);
    const userAgent = request.headers?.['user-agent'] || 'unknown';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        const statusCode: number = response.statusCode;
        const meta: Record<string, unknown> = {
          method,
          url,
          statusCode,
          duration: `${duration}ms`,
        };
        if (requestId) meta.requestId = requestId;
        if (userId) meta.userId = userId;
        if (ip) meta.ip = ip;
        meta.userAgent = userAgent;

        if (duration > 3000) {
          this.logger.logWithMeta('warn', `Slow request: ${method} ${url} - ${duration}ms`, meta);
        } else {
          this.logger.logWithMeta('info', `${method} ${url} ${statusCode} - ${duration}ms`, meta);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - now;
        const meta: Record<string, unknown> = {
          method,
          url,
          duration: `${duration}ms`,
          error: (error as Error).message,
        };
        if (requestId) meta.requestId = requestId;
        if (userId) meta.userId = userId;

        this.logger.logWithMeta('error', `${method} ${url} failed - ${duration}ms`, meta);
        return throwError(() => error);
      }),
    );
  }
}
