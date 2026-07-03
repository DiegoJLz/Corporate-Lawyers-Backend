import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PortalProfileService } from '../portal-profile.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockUser = {
  id: 'client-1',
  email: 'carlos@test.com',
  firstName: 'Carlos',
  lastName: 'Lopez',
  phone: '+52-555-0001',
  avatarUrl: null,
  preferredLanguage: 'es',
  lastLoginAt: NOW,
  createdAt: NOW,
  clientProfile: {
    id: 'cp-1',
    clientType: ClientType.INDIVIDUAL,
    rfc: 'ABC123456',
    companyName: null,
    fiscalAddress: 'CDMX',
  },
};

const mockUserWithProfileId = {
  id: 'client-1',
  clientProfile: { id: 'cp-1' },
};

const mockOnboardingUser = {
  firstName: 'Carlos',
  lastName: 'Lopez',
  clientProfile: {
    id: 'cp-1',
    clientType: ClientType.INDIVIDUAL,
    rfc: 'ABC123456',
    companyName: null,
    fiscalAddress: 'CDMX',
  },
};

// ─── Mock models ────────────────────────────────────────────────────

function createMockModel() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('PortalProfileService', () => {
  let service: PortalProfileService;

  const mockPrismaUser = createMockModel();
  const mockPrismaClientProfile = createMockModel();
  const mockAuditService = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalProfileService,
        {
          provide: PrismaService,
          useValue: {
            get user() { return mockPrismaUser; },
            get clientProfile() { return mockPrismaClientProfile; },
            $transaction: jest.fn((fn: any) => fn({
              user: mockPrismaUser,
              clientProfile: mockPrismaClientProfile,
            })),
          },
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PortalProfileService>(PortalProfileService);
  });

  // ─── getProfile ───────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return user profile with client profile data', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('client-1');

      expect(result).toEqual(mockUser);
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-1' },
          select: expect.objectContaining({
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            clientProfile: true,
          }),
        }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateProfile ────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update user fields and client profile fields', async () => {
      // First call: find user with clientProfile id
      mockPrismaUser.findUnique.mockResolvedValueOnce(mockUserWithProfileId);
      mockPrismaUser.update.mockResolvedValue({});
      mockPrismaClientProfile.update.mockResolvedValue({});
      // Second call: getProfile at the end
      mockPrismaUser.findUnique.mockResolvedValueOnce(mockUser);

      const result = await service.updateProfile('client-1', {
        firstName: 'Carlos Updated',
        rfc: 'NEW-RFC-789',
      });

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { firstName: 'Carlos Updated' },
      });
      expect(mockPrismaClientProfile.update).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
        data: { rfc: 'NEW-RFC-789' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('nonexistent', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── completeOnboarding ───────────────────────────────────────

  describe('completeOnboarding', () => {
    it('should create a ClientProfile via transaction', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);
      const createdProfile = {
        id: 'cp-new',
        userId: 'client-1',
        clientType: ClientType.INDIVIDUAL,
      };
      mockPrismaUser.update.mockResolvedValue({});
      mockPrismaClientProfile.create.mockResolvedValue(createdProfile);

      const result = await service.completeOnboarding('client-1', {
        firstName: 'Carlos',
        lastName: 'Lopez',
        clientType: ClientType.INDIVIDUAL,
      });

      expect(result.message).toBe('Onboarding completed successfully');
      expect(result.clientProfile).toEqual(createdProfile);
    });

    it('should throw ConflictException when profile already exists (duplicate)', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue({ id: 'cp-1', userId: 'client-1' });

      await expect(
        service.completeOnboarding('client-1', {
          firstName: 'Carlos',
          lastName: 'Lopez',
          clientType: ClientType.INDIVIDUAL,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for CORPORATION without companyName', async () => {
      await expect(
        service.completeOnboarding('client-1', {
          firstName: 'Carlos',
          lastName: 'Lopez',
          clientType: ClientType.CORPORATION,
          // companyName intentionally omitted
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow CORPORATION with companyName', async () => {
      mockPrismaClientProfile.findUnique.mockResolvedValue(null);
      const createdProfile = {
        id: 'cp-corp',
        userId: 'client-1',
        clientType: ClientType.CORPORATION,
        companyName: 'Acme Corp',
      };
      mockPrismaUser.update.mockResolvedValue({});
      mockPrismaClientProfile.create.mockResolvedValue(createdProfile);

      const result = await service.completeOnboarding('client-1', {
        firstName: 'Carlos',
        lastName: 'Lopez',
        clientType: ClientType.CORPORATION,
        companyName: 'Acme Corp',
      });

      expect(result.clientProfile.companyName).toBe('Acme Corp');
    });
  });

  // ─── getOnboardingStatus ──────────────────────────────────────

  describe('getOnboardingStatus', () => {
    it('should return complete status when clientProfile exists', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(mockOnboardingUser);

      const result = await service.getOnboardingStatus('client-1');

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should return incomplete status with missingFields when no clientProfile', async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        firstName: 'Carlos',
        lastName: 'Lopez',
        clientProfile: null,
      });

      const result = await service.getOnboardingStatus('client-1');

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('clientProfile');
      expect(result.missingFields).toContain('clientType');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(service.getOnboardingStatus('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── changePassword ───────────────────────────────────────────

  describe('changePassword', () => {
    it('should throw UnauthorizedException when current password is wrong', async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'client-1',
        passwordHash: '$2a$12$hashedpassword',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('client-1', 'wrongPassword', 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update password when current password is valid', async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'client-1',
        passwordHash: '$2a$12$hashedpassword',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$12$newhashedpassword');
      mockPrismaUser.update.mockResolvedValue({});

      const result = await service.changePassword(
        'client-1',
        'correctPassword',
        'newPassword123',
      );

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword123', 12);
      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { passwordHash: '$2a$12$newhashedpassword' },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent', 'old', 'new'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
