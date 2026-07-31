import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { AppCacheService } from '../../common/cache/cache.service';
import { CacheKeys, CacheTTL } from '../../common/cache/cache-key.constants';
import { CreateUserDto, CreateLawyerProfileDto, CreateClientProfileDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateLawyerProfileDto, UpdateClientProfileDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cacheService: AppCacheService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        status: 'ACTIVE',
      },
      select: this.userSelect,
    });

    return user;
  }

  async findAll(query: UserQueryDto) {
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.userSelect,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
      },
    };
  }

  async findOne(id: string) {
    return this.cacheService.getOrSet(
      CacheKeys.USER_PROFILE(id),
      async () => {
        const user = await this.prisma.user.findFirst({
          where: { id, deletedAt: null },
          select: {
            ...this.userSelect,
            lawyerProfile: true,
            clientProfile: true,
          },
        });

        if (!user) {
          throw new NotFoundException(`User with ID ${id} not found`);
        }

        return user;
      },
      CacheTTL.LONG,
    );
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      select: this.userSelect,
    });

    await this.cacheService.del(CacheKeys.USER_PROFILE(id));

    return user;
  }

  async remove(id: string, performedBy: string) {
    await this.findOne(id);

    if (id === performedBy) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.cacheService.del(CacheKeys.USER_PROFILE(id));

    await this.auditService.log({
      userId: performedBy,
      action: 'DELETE',
      entityType: 'User',
      entityId: id,
    });
  }

  // ─── Lawyer Profile ──────────────────────────────────────────

  async createLawyerProfile(userId: string, dto: CreateLawyerProfileDto) {
    const user = await this.findOne(userId);

    if (![UserRole.LAWYER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role as UserRole)) {
      throw new ForbiddenException('Only users with LAWYER, ADMIN, or SUPER_ADMIN role can have a lawyer profile');
    }

    const profile = await this.prisma.lawyerProfile.create({
      data: {
        userId,
        licenseNumber: dto.licenseNumber,
        specializations: dto.specializations ?? [],
        bio: dto.bio,
        hourlyRate: dto.hourlyRate ?? 0,
        yearsOfExperience: dto.yearsOfExperience,
        barAssociation: dto.barAssociation,
        isPartner: dto.isPartner ?? false,
      },
    });

    await this.cacheService.del(CacheKeys.USER_PROFILE(userId));

    return profile;
  }

  async updateLawyerProfile(userId: string, dto: UpdateLawyerProfileDto) {
    const profile = await this.prisma.lawyerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Lawyer profile not found');
    }

    const updated = await this.prisma.lawyerProfile.update({
      where: { userId },
      data: dto,
    });

    await this.cacheService.del(CacheKeys.USER_PROFILE(userId));

    return updated;
  }

  // ─── Client Profile ──────────────────────────────────────────

  async createClientProfile(userId: string, dto: CreateClientProfileDto) {
    const user = await this.findOne(userId);

    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Only users with CLIENT role can have a client profile');
    }

    return this.prisma.clientProfile.create({
      data: {
        userId,
        clientType: dto.clientType,
        rfc: dto.rfc,
        companyName: dto.companyName,
        fiscalAddress: dto.fiscalAddress,
        referredBy: dto.referredBy,
        notes: dto.notes,
      },
    });
  }

  async updateClientProfile(userId: string, dto: UpdateClientProfileDto) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Client profile not found');
    }

    return this.prisma.clientProfile.update({
      where: { userId },
      data: dto,
    });
  }

  // ─── Admin Password Reset ──────────────────────────────────

  async adminResetPassword(targetUserId: string, performedByUserId: string) {
    await this.findOne(targetUserId);

    if (targetUserId === performedByUserId) {
      throw new ForbiddenException('Use the standard password reset flow for your own account');
    }

    // Generate a temporary password: 12-char alphanumeric
    const tempPassword = randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoke all sessions for the target user
    await this.prisma.session.updateMany({
      where: { userId: targetUserId },
      data: { isRevoked: true },
    });

    await this.cacheService.del(CacheKeys.USER_PROFILE(targetUserId));

    await this.auditService.log({
      userId: performedByUserId,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'User',
      entityId: targetUserId,
    });

    return { temporaryPassword: tempPassword };
  }

  // ─── Select fields ──────────────────────────────────────────

  private readonly userSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    role: true,
    status: true,
    avatarUrl: true,
    twoFactorEnabled: true,
    lastLoginAt: true,
    preferredLanguage: true,
    passwordChangedAt: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.UserSelect;
}
