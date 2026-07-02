import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module';
import { AppConfigModule } from './config/config.module';
import { JwtStrategy } from './security/strategies/jwt.strategy';
import { JwtRefreshStrategy } from './security/strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from './security/guards/jwt-auth.guard';
import { RolesGuard } from './security/guards/roles.guard';
import { ThrottlerBehindProxyGuard } from './security/guards/throttler-behind-proxy.guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';

@Global()
@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [
    JwtStrategy,
    JwtRefreshStrategy,
    // Filters — PrismaExceptionFilter registered first so it catches Prisma errors
    // before AllExceptionsFilter (NestJS evaluates in reverse registration order)
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    // Guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
  exports: [PrismaModule],
})
export class CoreModule {}
