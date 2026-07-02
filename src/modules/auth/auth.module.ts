import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../../services/audit/audit.module';
import authConfig from '../../core/config/auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// M5 FIX: Explicit imports for all dependencies
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ConfigModule.forFeature(authConfig),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
