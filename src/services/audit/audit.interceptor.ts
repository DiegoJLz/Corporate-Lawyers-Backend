import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { Request } from 'express';

export const AUDIT_ACTION_KEY = 'audit_action';
export const AUDIT_ENTITY_KEY = 'audit_entity';

export const AuditLog = (action: string, entityType: string) => {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(AUDIT_ACTION_KEY, action)(target, propertyKey, descriptor);
    SetMetadata(AUDIT_ENTITY_KEY, entityType)(target, propertyKey, descriptor);
    return descriptor;
  };
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler());
    const entityType = this.reflector.get<string>(AUDIT_ENTITY_KEY, context.getHandler());

    if (!action || !entityType) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { userId?: string } | undefined;
    const rawId = request.params?.id;
    const entityId = Array.isArray(rawId) ? rawId[0] : rawId;
    const ip = Array.isArray(request.ip) ? request.ip[0] : request.ip;
    const ua = request.headers['user-agent'] as string | undefined;

    return next.handle().pipe(
      tap((response) => {
        this.auditService.log({
          userId: user?.userId,
          action,
          entityType,
          entityId: entityId || (response as Record<string, string>)?.id,
          newValue: request.method !== 'GET' ? (request.body as Record<string, unknown>) : undefined,
          ipAddress: ip,
          userAgent: ua,
        });
      }),
    );
  }
}
