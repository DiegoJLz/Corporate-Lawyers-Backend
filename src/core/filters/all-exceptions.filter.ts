import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../common/logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(AppLoggerService) private readonly logger: AppLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: any = undefined;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || exception.message;
        error = responseObj.error || error;
        details = responseObj.details;
      }

      error =
        HttpStatus[statusCode]?.toString().replace(/_/g, ' ') ||
        'Unknown Error';
    } else if (exception instanceof Error) {
      message = exception.message;
      stack = exception.stack;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        AllExceptionsFilter.name,
      );
    } else {
      this.logger.error(
        'Unknown exception',
        String(exception),
        AllExceptionsFilter.name,
      );
    }

    // In production, hide internal error details for 500 errors
    if (isProduction && statusCode >= 500) {
      message = 'Internal server error';
      details = undefined;
    }

    const requestId: string | undefined = (request as any).requestId;

    response.status(statusCode).json({
      success: false,
      error: {
        statusCode,
        error,
        message,
        ...(!isProduction && details ? { details } : {}),
        ...(!isProduction && stack ? { stack } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
