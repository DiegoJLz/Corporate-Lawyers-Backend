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
import { BillingModule } from './modules/billing/billing.module';
import { CrmModule } from './modules/crm/crm.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationRestModule } from './modules/notifications/notification.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
import { EmailProviderModule } from './modules/integrations/email/email-provider.module';
import { PdfModule } from './modules/integrations/pdf/pdf.module';
import { CfdiModule } from './modules/integrations/cfdi/cfdi.module';
import { SignatureModule } from './modules/integrations/signatures/signature.module';
import { WebhookModule } from './modules/integrations/webhooks/webhook.module';
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
        // App
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        API_PREFIX: Joi.string().default('api'),
        API_VERSION: Joi.number().default(1),
        DATABASE_URL: Joi.string().required(),
        // Auth
        JWT_ACCESS_SECRET: Joi.string().required().min(16),
        JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().required().min(16),
        JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
        BCRYPT_ROUNDS: Joi.number().default(12),
        TWO_FACTOR_APP_NAME: Joi.string().default('CorporateLawyers'),
        // Redis
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').default(''),
        // Storage
        STORAGE_ENDPOINT: Joi.string().default('http://localhost:9000'),
        STORAGE_ACCESS_KEY: Joi.string().default('minioadmin'),
        STORAGE_SECRET_KEY: Joi.string().default('minioadmin'),
        STORAGE_BUCKET: Joi.string().default('corporate-lawyers'),
        STORAGE_REGION: Joi.string().default('us-east-1'),
        // Email
        EMAIL_PROVIDER: Joi.string().valid('sendgrid', 'smtp').default('sendgrid'),
        MAIL_FROM: Joi.string().required(),
        SENDGRID_API_KEY: Joi.string().allow('').default('')
          .when('EMAIL_PROVIDER', { is: 'sendgrid', then: Joi.string().required() }),
        SMTP_HOST: Joi.string().allow('').default('')
          .when('EMAIL_PROVIDER', { is: 'smtp', then: Joi.string().required() }),
        SMTP_PORT: Joi.number().default(587),
        SMTP_SECURE: Joi.string().default('false'),
        SMTP_USER: Joi.string().allow('').default(''),
        SMTP_PASS: Joi.string().allow('').default(''),
        // Firm
        FIRM_NAME: Joi.string().default('Corporate Lawyers S.C.'),
        FIRM_RFC: Joi.string().allow('').default(''),
        FIRM_ADDRESS: Joi.string().allow('').default(''),
        FIRM_PHONE: Joi.string().allow('').default(''),
        FIRM_EMAIL: Joi.string().allow('').default(''),
        // URLs
        PORTAL_URL: Joi.string().default('http://localhost:3001'),
        API_URL: Joi.string().default('http://localhost:3000'),
        // CFDI
        CFDI_PROVIDER: Joi.string().valid('facturapi', 'none').default('none'),
        FACTURAPI_API_KEY: Joi.string().allow('').default('')
          .when('CFDI_PROVIDER', { is: 'facturapi', then: Joi.string().required() }),
        FACTURAPI_ENVIRONMENT: Joi.string().valid('sandbox', 'production').default('sandbox'),
        // Signatures
        SIGNATURE_PROVIDER: Joi.string().valid('docusign', 'none').default('none'),
        DOCUSIGN_API_KEY: Joi.string().allow('').default('')
          .when('SIGNATURE_PROVIDER', { is: 'docusign', then: Joi.string().required() }),
        SIGNATURE_WEBHOOK_SECRET: Joi.string().default('dev-webhook-secret'),
        // Rate limiting & CORS
        CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(60),
      }),
      validationOptions: { allowUnknown: false, abortEarly: false },
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

    // Feature Modules — Phase 3
    BillingModule,
    CrmModule,
    MessagingModule,

    // Feature Modules — Phase 4
    NotificationRestModule,
    ClientPortalModule,

    // Integration Modules — Phase 5
    EmailProviderModule,
    PdfModule,
    CfdiModule,
    SignatureModule,
    WebhookModule,
  ],
})
export class AppModule {}
