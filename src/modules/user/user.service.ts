import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { CreateUserDto, CreateLawyerProfileDto, CreateClientProfileDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateLawyerProfileDto, UpdateClientProfileDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

    if (user.role !== UserRole.LAWYER) {
      throw new ForbiddenException('Only users with LAWYER role can have a lawyer profile');
    }

    return this.prisma.lawyerProfile.create({
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
  }

  async updateLawyerProfile(userId: string, dto: UpdateLawyerProfileDto) {
    const profile = await this.prisma.lawyerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Lawyer profile not found');
    }

    return this.prisma.lawyerProfile.update({
      where: { userId },
      data: dto,
    });
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
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.UserSelect;
}
