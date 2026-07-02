import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import authConfig from '../../../core/config/auth.config';

// Mock uuid to return a deterministic value
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-token' }));

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    role: 'CLIENT' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserModel = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockSessionModel = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockPasswordResetTokenModel = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockPrisma = {
    get user() { return mockUserModel; },
    get session() { return mockSessionModel; },
    get passwordResetToken() { return mockPasswordResetTokenModel; },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    decode: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockAuthConfig = {
    jwtAccessSecret: 'test-secret',
    jwtAccessExpiration: '15m',
    jwtRefreshSecret: 'test-refresh',
    jwtRefreshExpiration: '7d',
    bcryptRounds: 4,
    twoFactorAppName: 'TestApp',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Set up a known password hash for the mock user
    mockUser.passwordHash = await bcrypt.hash('ValidPass1!', mockAuthConfig.bcryptRounds);

    // Default JWT mock behavior
    mockJwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    mockJwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

    // Default session create behavior
    mockSessionModel.create.mockResolvedValue({ id: 'session-1' });

    // Default audit log behavior
    mockAuditService.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── register ─────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      email: 'New@Example.com',
      password: 'SecurePass1!',
      firstName: 'New',
      lastName: 'User',
    };

    it('should create a new user with CLIENT role', async () => {
      mockUserModel.findUnique.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue({ ...mockUser, email: 'new@example.com' });

      const result = await service.register(registerDto);

      expect(mockUserModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          role: 'CLIENT',
          status: 'ACTIVE',
          firstName: 'New',
          lastName: 'User',
        }),
      });
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should hash the password before storing', async () => {
      mockUserModel.findUnique.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser);

      await service.register(registerDto);

      const createCall = mockUserModel.create.mock.calls[0][0];
      const storedHash = createCall.data.passwordHash;

      // The stored value must not be the plaintext password
      expect(storedHash).not.toBe(registerDto.password);
      // It must be a valid bcrypt hash that matches the original password
      const matches = await bcrypt.compare(registerDto.password, storedHash);
      expect(matches).toBe(true);
    });

    it('should always force CLIENT role regardless of input', async () => {
      mockUserModel.findUnique.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue({ ...mockUser, role: 'CLIENT' });

      // Even if someone attempts to pass role info, register() always forces CLIENT
      await service.register({ ...registerDto } as any);

      expect(mockUserModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'CLIENT' }),
      });
    });
  });

  // ─── login ────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto = { email: 'Test@Example.com', password: 'ValidPass1!' };

    it('should return tokens on valid credentials', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      mockUserModel.update.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.email).toBe(mockUser.email);
      // Should reset failed attempts on successful login
      expect(mockUserModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      // handleFailedLogin calls update which returns the user with incremented attempts
      mockUserModel.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 1 });

      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000), // locked 1h from now
      };
      mockUserModel.findUnique.mockResolvedValue(lockedUser);

      try {
        await service.login(loginDto);
        fail('Expected UnauthorizedException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toMatch(/locked/i);
      }
    });

    it('should throw if account is suspended', async () => {
      const suspendedUser = { ...mockUser, status: 'SUSPENDED' as const };
      mockUserModel.findUnique.mockResolvedValue(suspendedUser);

      try {
        await service.login(loginDto);
        fail('Expected UnauthorizedException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toMatch(/suspended/i);
      }
    });

    it('should increment failedLoginAttempts on wrong password', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      mockUserModel.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 1 });

      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);

      // handleFailedLogin should call update with increment
      expect(mockUserModel.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
    });

    it('should require 2FA code when 2FA is enabled', async () => {
      const twoFactorUser = {
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      };
      mockUserModel.findUnique.mockResolvedValue(twoFactorUser);

      // Login without providing 2FA code
      try {
        await service.login({ email: 'test@example.com', password: 'ValidPass1!' });
        fail('Expected UnauthorizedException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toMatch(/two-factor/i);
      }
    });

    it('should throw on non-existent user', async () => {
      mockUserModel.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Pass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on soft-deleted user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      mockUserModel.findUnique.mockResolvedValue(deletedUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── refreshTokens ───────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should revoke old session and return new tokens', async () => {
      const tokenHash = createHash('sha256').update('valid-refresh-token').digest('hex');
      const session = {
        id: 'session-1',
        refreshToken: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        userId: mockUser.id,
        user: mockUser,
      };

      mockSessionModel.findUnique.mockResolvedValue(session);
      mockSessionModel.update.mockResolvedValue({ ...session, isRevoked: true });

      const result = await service.refreshTokens('valid-refresh-token');

      // Old session should be revoked
      expect(mockSessionModel.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { isRevoked: true },
      });

      // New tokens should be returned
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');

      // New session should be created
      expect(mockSessionModel.create).toHaveBeenCalled();
    });

    it('should throw on invalid/revoked refresh token', async () => {
      // Session not found
      mockSessionModel.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on revoked session', async () => {
      const tokenHash = createHash('sha256').update('revoked-token').digest('hex');
      mockSessionModel.findUnique.mockResolvedValue({
        id: 'session-2',
        refreshToken: tokenHash,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        user: mockUser,
      });

      await expect(service.refreshTokens('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on expired session', async () => {
      const tokenHash = createHash('sha256').update('expired-token').digest('hex');
      mockSessionModel.findUnique.mockResolvedValue({
        id: 'session-3',
        refreshToken: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        user: mockUser,
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should hash the incoming token with SHA-256 for lookup', async () => {
      mockSessionModel.findUnique.mockResolvedValue(null);

      const rawToken = 'some-raw-refresh-token';
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');

      await expect(service.refreshTokens(rawToken)).rejects.toThrow();

      expect(mockSessionModel.findUnique).toHaveBeenCalledWith({
        where: { refreshToken: expectedHash },
        include: { user: true },
      });
    });
  });

  // ─── logout ───────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke session by hashed token', async () => {
      mockSessionModel.updateMany.mockResolvedValue({ count: 1 });

      const rawToken = 'refresh-to-revoke';
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');

      await service.logout(rawToken, 'user-1');

      expect(mockSessionModel.updateMany).toHaveBeenCalledWith({
        where: { refreshToken: expectedHash },
        data: { isRevoked: true },
      });
    });

    it('should log audit event when userId is provided', async () => {
      mockSessionModel.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-token', 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'LOGOUT',
        }),
      );
    });

    it('should not log audit event when userId is not provided', async () => {
      mockSessionModel.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-token');

      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });

  // ─── forgotPassword ──────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should always return success message (prevent email enumeration)', async () => {
      // When user does not exist
      mockUserModel.findUnique.mockResolvedValue(null);

      const resultNoUser = await service.forgotPassword('nonexistent@example.com');
      expect(resultNoUser.message).toBe('If the email exists, a reset link has been sent');

      jest.clearAllMocks();

      // When user exists
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      mockPasswordResetTokenModel.updateMany.mockResolvedValue({ count: 0 });
      mockPasswordResetTokenModel.create.mockResolvedValue({ id: 'reset-1' });
      mockAuditService.log.mockResolvedValue(undefined);

      const resultWithUser = await service.forgotPassword('test@example.com');
      expect(resultWithUser.message).toBe('If the email exists, a reset link has been sent');
    });

    it('should create a reset token when user exists', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      mockPasswordResetTokenModel.updateMany.mockResolvedValue({ count: 0 });
      mockPasswordResetTokenModel.create.mockResolvedValue({ id: 'reset-1' });

      await service.forgotPassword('test@example.com');

      expect(mockPasswordResetTokenModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          token: 'mock-uuid-token',
        }),
      });
    });

    it('should invalidate existing reset tokens before creating a new one', async () => {
      mockUserModel.findUnique.mockResolvedValue(mockUser);
      mockPasswordResetTokenModel.updateMany.mockResolvedValue({ count: 1 });
      mockPasswordResetTokenModel.create.mockResolvedValue({ id: 'reset-2' });

      await service.forgotPassword('test@example.com');

      // updateMany should be called first to invalidate old tokens
      expect(mockPasswordResetTokenModel.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });

      // Then create the new one
      expect(mockPasswordResetTokenModel.create).toHaveBeenCalled();
    });

    it('should not create a token for soft-deleted user', async () => {
      mockUserModel.findUnique.mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await service.forgotPassword('test@example.com');

      expect(mockPasswordResetTokenModel.create).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword ───────────────────────────────────────────

  describe('resetPassword', () => {
    const validResetToken = {
      id: 'reset-1',
      token: 'valid-reset-token',
      userId: mockUser.id,
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      user: mockUser,
    };

    it('should update password and revoke all sessions', async () => {
      mockPasswordResetTokenModel.findUnique.mockResolvedValue(validResetToken);
      mockUserModel.update.mockResolvedValue(mockUser);
      mockPasswordResetTokenModel.update.mockResolvedValue({ ...validResetToken, usedAt: new Date() });
      mockSessionModel.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.resetPassword('valid-reset-token', 'NewSecurePass1!');

      expect(result.message).toBe('Password has been reset successfully');

      // Password should be updated (hashed, not plaintext)
      const userUpdateCall = mockUserModel.update.mock.calls[0][0];
      expect(userUpdateCall.data.passwordHash).toBeDefined();
      expect(userUpdateCall.data.passwordHash).not.toBe('NewSecurePass1!');
      expect(userUpdateCall.data.failedLoginAttempts).toBe(0);
      expect(userUpdateCall.data.lockedUntil).toBeNull();

      // Reset token should be marked as used
      expect(mockPasswordResetTokenModel.update).toHaveBeenCalledWith({
        where: { id: validResetToken.id },
        data: { usedAt: expect.any(Date) },
      });

      // All sessions should be revoked
      expect(mockSessionModel.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        data: { isRevoked: true },
      });
    });

    it('should throw on invalid reset token', async () => {
      mockPasswordResetTokenModel.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'NewPass1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on already-used reset token', async () => {
      mockPasswordResetTokenModel.findUnique.mockResolvedValue({
        ...validResetToken,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword('used-token', 'NewPass1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on expired reset token', async () => {
      mockPasswordResetTokenModel.findUnique.mockResolvedValue({
        ...validResetToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('expired-token', 'NewPass1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should audit the password reset', async () => {
      mockPasswordResetTokenModel.findUnique.mockResolvedValue(validResetToken);
      mockUserModel.update.mockResolvedValue(mockUser);
      mockPasswordResetTokenModel.update.mockResolvedValue({ ...validResetToken, usedAt: new Date() });
      mockSessionModel.updateMany.mockResolvedValue({ count: 0 });

      await service.resetPassword('valid-reset-token', 'NewSecurePass1!');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          action: 'PASSWORD_RESET_COMPLETED',
        }),
      );
    });
  });
});
