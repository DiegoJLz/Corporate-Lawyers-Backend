import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../services/audit/audit.service';
import { AppCacheService } from '../../../common/cache/cache.service';
import { UserRole } from '@prisma/client';

jest.mock('bcryptjs');

const mockUser = {
  id: 'user-1',
  email: 'juan.perez@firma.com',
  firstName: 'Juan',
  lastName: 'Perez',
  phone: '+5215512345678',
  role: UserRole.LAWYER,
  status: 'ACTIVE',
  avatarUrl: null,
  twoFactorEnabled: false,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockUserWithProfiles = {
  ...mockUser,
  lawyerProfile: null,
  clientProfile: null,
};

const mockLawyerProfile = {
  id: 'profile-1',
  userId: 'user-1',
  licenseNumber: '12345678',
  specializations: ['Civil', 'Mercantil'],
  bio: 'Experienced lawyer',
  hourlyRate: 2500,
  yearsOfExperience: 10,
  barAssociation: 'CDMX Bar',
  isPartner: false,
};

describe('UserService', () => {
  let service: UserService;

  const mockPrismaUser = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  const mockPrismaLawyerProfile = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockPrismaClientProfile = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {
            get user() { return mockPrismaUser; },
            get lawyerProfile() { return mockPrismaLawyerProfile; },
            get clientProfile() { return mockPrismaClientProfile; },
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: AppCacheService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), getOrSet: jest.fn((k: string, fn: () => any) => fn()), invalidatePattern: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  // ─── create ────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      email: 'Juan.Perez@Firma.com',
      password: 'SecurePass123!',
      firstName: 'Juan',
      lastName: 'Perez',
      phone: '+5215512345678',
      role: UserRole.LAWYER,
    };

    it('should create a user and hash password', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrismaUser.create.mockResolvedValue(mockUser);

      const result = await service.create(createDto);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: 'juan.perez@firma.com' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass123!', 12);
      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'juan.perez@firma.com',
            passwordHash: 'hashed-password',
            firstName: 'Juan',
            lastName: 'Perez',
            role: UserRole.LAWYER,
            status: 'ACTIVE',
          }),
        }),
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'A user with this email already exists',
      );
      expect(mockPrismaUser.create).not.toHaveBeenCalled();
    });
  });

  // ─── findAll ───────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUser];
      mockPrismaUser.findMany.mockResolvedValue(users);
      mockPrismaUser.count.mockResolvedValue(1);

      const result = await service.findAll({} as any);

      expect(mockPrismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          take: 20,
          skip: 0,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(mockPrismaUser.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(result.data).toEqual(users);
      expect(result.meta).toEqual({
        total: 1,
        limit: 20,
        offset: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('should filter by role', async () => {
      mockPrismaUser.findMany.mockResolvedValue([]);
      mockPrismaUser.count.mockResolvedValue(0);

      await service.findAll({ role: UserRole.CLIENT } as any);

      expect(mockPrismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, role: UserRole.CLIENT },
        }),
      );
      expect(mockPrismaUser.count).toHaveBeenCalledWith({
        where: { deletedAt: null, role: UserRole.CLIENT },
      });
    });
  });

  // ─── findOne ───────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return user with profiles', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(mockUserWithProfiles);

      const result = await service.findOne('user-1');

      expect(mockPrismaUser.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
        select: expect.objectContaining({
          id: true,
          email: true,
          lawyerProfile: true,
          clientProfile: true,
        }),
      });
      expect(result).toEqual(mockUserWithProfiles);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('nonexistent')).rejects.toThrow(
        'User with ID nonexistent not found',
      );
    });
  });

  // ─── update ────────────────────────────────────────────────────

  describe('update', () => {
    it('should update user fields', async () => {
      const updatedUser = { ...mockUser, firstName: 'Carlos' };
      mockPrismaUser.findFirst.mockResolvedValue(mockUserWithProfiles);
      mockPrismaUser.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', {
        firstName: 'Carlos',
      });

      expect(mockPrismaUser.findFirst).toHaveBeenCalled();
      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          firstName: 'Carlos',
          lastName: undefined,
          phone: undefined,
        },
        select: expect.objectContaining({
          id: true,
          email: true,
        }),
      });
      expect(result).toEqual(updatedUser);
    });
  });

  // ─── remove ────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete user (set deletedAt)', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(mockUserWithProfiles);
      mockPrismaUser.update.mockResolvedValue(undefined);
      mockAuditService.log.mockResolvedValue(undefined);

      await service.remove('user-1', 'admin-1');

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 'admin-1',
        action: 'DELETE',
        entityType: 'User',
        entityId: 'user-1',
      });
    });

    it('should throw ForbiddenException when deleting own account', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(mockUserWithProfiles);

      await expect(service.remove('user-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.remove('user-1', 'user-1')).rejects.toThrow(
        'You cannot delete your own account',
      );
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });
  });

  // ─── createLawyerProfile ──────────────────────────────────────

  describe('createLawyerProfile', () => {
    const lawyerDto = {
      licenseNumber: '12345678',
      specializations: ['Civil', 'Mercantil'],
      bio: 'Experienced lawyer',
      hourlyRate: 2500,
      yearsOfExperience: 10,
      barAssociation: 'CDMX Bar',
      isPartner: false,
    };

    it('should create profile for LAWYER role user', async () => {
      mockPrismaUser.findFirst.mockResolvedValue({
        ...mockUserWithProfiles,
        role: UserRole.LAWYER,
      });
      mockPrismaLawyerProfile.create.mockResolvedValue(mockLawyerProfile);

      const result = await service.createLawyerProfile('user-1', lawyerDto);

      expect(mockPrismaLawyerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          licenseNumber: '12345678',
          specializations: ['Civil', 'Mercantil'],
          bio: 'Experienced lawyer',
          hourlyRate: 2500,
          yearsOfExperience: 10,
          barAssociation: 'CDMX Bar',
          isPartner: false,
        },
      });
      expect(result).toEqual(mockLawyerProfile);
    });

    it('should throw ForbiddenException for non-LAWYER role', async () => {
      mockPrismaUser.findFirst.mockResolvedValue({
        ...mockUserWithProfiles,
        role: UserRole.CLIENT,
      });

      await expect(
        service.createLawyerProfile('user-1', lawyerDto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.createLawyerProfile('user-1', lawyerDto),
      ).rejects.toThrow(
        'Only users with LAWYER role can have a lawyer profile',
      );
      expect(mockPrismaLawyerProfile.create).not.toHaveBeenCalled();
    });
  });
});
