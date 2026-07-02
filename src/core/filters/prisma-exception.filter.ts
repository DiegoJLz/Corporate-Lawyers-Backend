import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

const PRISMA_ERROR_MAP: Record<
  string,
  { status: number; message: string }
> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    message: 'A record with this value already exists',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    message: 'Record not found',
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Foreign key constraint failed',
  },
  P2014: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The change you are trying to make would violate a required relation',
  },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorMapping = PRISMA_ERROR_MAP[exception.code];

    const statusCode =
      errorMapping?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      errorMapping?.message || 'An unexpected database error occurred';

    this.logger.error(
      `Prisma error ${exception.code}: ${exception.message}`,
      exception.stack,
    );

    const requestId =
      (request.headers['x-request-id'] as string) || undefined;

    response.status(statusCode).json({
      success: false,
      error: {
        statusCode,
        error: HttpStatus[statusCode]?.toString().replace(/_/g, ' ') || 'Database Error',
        message,
        details: {
          code: exception.code,
          meta: exception.meta,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(requestId && { requestId }),
      },
    });
  }
}
