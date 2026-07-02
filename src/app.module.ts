import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { AuditModule } from './services/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import appConfig from './core/config/app.config';
import authConfig from './core/config/auth.config';
import storageConfig from './core/config/storage.config';
import mailConfig from './core/config/mail.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, storageConfig, mailConfig],
      envFilePath: '.env',
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
      },
    ]),

    // Core
    CoreModule,
    AuditModule,

    // Feature Modules
    AuthModule,
    UserModule,
  ],
})
export class AppModule {}
