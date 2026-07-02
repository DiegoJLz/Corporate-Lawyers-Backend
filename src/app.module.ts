import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { CoreModule } from './core/core.module';
import { AuditModule } from './services/audit/audit.module';
import { NotificationModule } from './services/notification/notification.module';
import { SearchModule } from './services/search/search.module';
import { StorageModule } from './services/storage/storage.module';
import { QueueModule } from './services/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CaseModule } from './modules/case/case.module';
import { DocumentModule } from './modules/document/document.module';
import { CalendarModule } from './modules/calendar/calendar.module';
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
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().required().min(16),
        JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().required().min(16),
        JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
        BCRYPT_ROUNDS: Joi.number().default(12),
        CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(60),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
      },
    ]),

    // Core & Transversal
    CoreModule,
    AuditModule,
    NotificationModule,
    QueueModule,
    StorageModule,
    SearchModule,

    // Feature Modules — Phase 1
    AuthModule,
    UserModule,

    // Feature Modules — Phase 2
    CaseModule,
    DocumentModule,
    CalendarModule,
  ],
})
export class AppModule {}
