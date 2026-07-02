import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module';
import { PrismaService } from './database/prisma.service';
import { AppConfigModule } from './config/config.module';
import { JwtStrategy } from './security/strategies/jwt.strategy';
import { JwtRefreshStrategy } from './security/strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from './security/guards/jwt-auth.guard';
import { RolesGuard } from './security/guards/roles.guard';
import { ThrottlerBehindProxyGuard } from './security/guards/throttler-behind-proxy.guard';

@Global()
@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [
    PrismaService,
    JwtStrategy,
    JwtRefreshStrategy,
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
  exports: [PrismaService],
})
export class CoreModule {}
