import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponse<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: T;

  @ApiPropertyOptional()
  meta?: Record<string, any>;

  constructor(data: T, meta?: Record<string, any>) {
    this.success = true;
    this.data = data;
    this.meta = meta;
  }
}

class ApiErrorDetail {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional()
  details?: any;
}

class ApiErrorMeta {
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/cases' })
  path: string;

  @ApiProperty({ example: 'req-abc123' })
  requestId: string;
}

export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ApiErrorDetail })
  error: ApiErrorDetail;

  @ApiProperty({ type: ApiErrorMeta })
  meta: ApiErrorMeta;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    path: string,
    requestId: string,
    details?: any,
  ) {
    this.success = false;
    this.error = { statusCode, error, message, details };
    this.meta = {
      timestamp: new Date().toISOString(),
      path,
      requestId,
    };
  }
}
