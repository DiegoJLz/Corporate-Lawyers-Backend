import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import authConfig from '../../core/config/auth.config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole, UserStatus } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    @Inject(authConfig.KEY)
    private readonly authCfg: ConfigType<typeof authConfig>,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.authCfg.bcryptRounds);

    // C3 FIX: Always force CLIENT role on public registration
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
      },
    });

    await this.auditService.log({
      userId: user.id,
      action: 'REGISTER',
      entityType: 'User',
      entityId: user.id,
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.createSession(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Account is locked. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    // Check status
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id, ip, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('Two-factor authentication code is required');
      }

      const isValid = this.verifyTotpCode(user.twoFactorSecret!, dto.twoFactorCode);
      if (!isValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    // Reset failed attempts and update login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.createSession(user.id, tokens.refreshToken, ip, userAgent);

    await this.auditService.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    // A2 FIX: Look up session by hashed refresh token
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshToken: tokenHash },
      include: { user: true },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session
    await this.prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(
      session.user.id,
      session.user.email,
      session.user.role,
    );
    await this.createSession(session.user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(refreshToken: string, userId?: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.updateMany({
      where: { refreshToken: tokenHash },
      data: { isRevoked: true },
    });

    // M4 FIX: Audit individual logout
    if (userId) {
      await this.auditService.log({
        userId,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: userId,
      });
    }
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId,
      action: 'LOGOUT_ALL',
      entityType: 'User',
      entityId: userId,
    });
  }

  // ─── 2FA ──────────────────────────────────────────────────────

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
      issuer: this.authCfg.twoFactorAppName,
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
    };
  }

  async verifyAndEnableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication has not been set up');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const isValid = this.verifyTotpCode(user.twoFactorSecret, code);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    await this.auditService.log({
      userId,
      action: '2FA_ENABLED',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = this.verifyTotpCode(user.twoFactorSecret!, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    await this.auditService.log({
      userId,
      action: '2FA_DISABLED',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Two-factor authentication disabled successfully' };
  }

  // ─── Password Reset ──────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user || user.deletedAt) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Invalidate existing reset tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // TODO: Send email with reset link via notification service
    this.logger.log(`Password reset token generated for user ${user.id}`);

    await this.auditService.log({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
    });

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.authCfg.bcryptRounds);

    // Use sequential operations instead of $transaction array (compatible with extended client)
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Revoke all sessions on password reset
    await this.prisma.session.updateMany({
      where: { userId: resetToken.userId },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId: resetToken.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: resetToken.userId,
    });

    return { message: 'Password has been reset successfully' };
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        secret: this.authCfg.jwtAccessSecret,
        expiresIn: this.authCfg.jwtAccessExpiration,
      } as any),
      this.jwtService.signAsync(payload as any, {
        secret: this.authCfg.jwtRefreshSecret,
        expiresIn: this.authCfg.jwtRefreshExpiration,
      } as any),
    ]);

    return { accessToken, refreshToken };
  }

  private async createSession(
    userId: string,
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ) {
    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    // A2 FIX: Store hashed refresh token
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken: tokenHash,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });
  }

  private async handleFailedLogin(userId: string, ip?: string, userAgent?: string) {
    // M4 FIX: Audit failed login attempts
    await this.auditService.log({
      userId,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: userId,
      ipAddress: ip,
      userAgent,
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
    });

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil },
      });

      await this.auditService.log({
        userId,
        action: 'ACCOUNT_LOCKED',
        entityType: 'User',
        entityId: userId,
        newValue: { reason: 'too_many_failed_attempts', lockedUntil: lockedUntil.toISOString() },
      });

      this.logger.warn(`Account locked for user ${userId} due to ${MAX_FAILED_ATTEMPTS} failed login attempts`);
    }
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  // A2: Hash tokens with SHA-256 before storing
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
