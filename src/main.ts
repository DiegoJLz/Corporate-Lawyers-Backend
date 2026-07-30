import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  // Security — Helmet with refined CSP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));

  app.use(cookieParser(process.env.COOKIE_SECRET));

  // Compression
  app.use(compression({ threshold: 1024, level: 6 }));

  // Body size limits
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: 422,
    }),
  );

  // Swagger — available in dev and staging
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Corporate Lawyers API')
      .setDescription('API para plataforma de gestión legal')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth')
      .addTag('Users')
      .addTag('Cases')
      .addTag('Documents')
      .addTag('Calendar')
      .addTag('Billing')
      .addTag('CRM')
      .addTag('Messaging')
      .addTag('Notifications')
      .addTag('Portal')
      .addTag('Integrations')
      .addTag('Webhooks')
      .addTag('Health')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // M9: Protect Swagger with basic auth in staging
    if (process.env.NODE_ENV === 'staging') {
      const swaggerUser = process.env.SWAGGER_USER || 'admin';
      const swaggerPass = process.env.SWAGGER_PASS || 'changeme';
      app.use('/docs', (req: any, res: any, next: any) => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
          return res.status(401).send('Authentication required');
        }
        const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
        if (user === swaggerUser && pass === swaggerPass) return next();
        return res.status(401).send('Invalid credentials');
      });
    }

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger docs available at /docs');
  }

  // M1 FIX: Replace NestJS default logger with Winston
  try {
    const { AppLoggerService } = await import('./common/logger/logger.service');
    const winstonLogger = app.get(AppLoggerService);
    app.useLogger(winstonLogger);
  } catch { /* logger module may not be available in test */ }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap();
