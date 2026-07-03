import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClientType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../services/audit/audit.service';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

@Injectable()
export class PortalProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        preferredLanguage: true,
        lastLoginAt: true,
        createdAt: true,
        clientProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateClientProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, clientProfile: { select: { id: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userUpdate: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userUpdate.firstName = dto.firstName;
    if (dto.lastName !== undefined) userUpdate.lastName = dto.lastName;
    if (dto.phone !== undefined) userUpdate.phone = dto.phone;

    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }

    if (user.clientProfile) {
      const profileUpdate: Record<string, unknown> = {};
      if (dto.clientType !== undefined) profileUpdate.clientType = dto.clientType;
      if (dto.rfc !== undefined) profileUpdate.rfc = dto.rfc;
      if (dto.companyName !== undefined) profileUpdate.companyName = dto.companyName;
      if (dto.fiscalAddress !== undefined) profileUpdate.fiscalAddress = dto.fiscalAddress;
      if (dto.notes !== undefined) profileUpdate.notes = dto.notes;

      if (Object.keys(profileUpdate).length > 0) {
        await this.prisma.clientProfile.update({
          where: { id: user.clientProfile.id },
          data: profileUpdate,
        });
      }
    }

    return this.getProfile(userId);
  }

  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
    if (dto.clientType === ClientType.CORPORATION && !dto.companyName) {
      throw new BadRequestException('Company name is required for corporation clients');
    }

    const existingProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });

    // M1 FIX: ConflictException instead of BadRequestException
    if (existingProfile) {
      throw new ConflictException('Onboarding has already been completed');
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      // A1 FIX: Set status to ACTIVE on onboarding completion
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: UserStatus.ACTIVE,
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
      });

      const clientProfile = await tx.clientProfile.create({
        data: {
          userId,
          clientType: dto.clientType,
          ...(dto.rfc !== undefined && { rfc: dto.rfc }),
          ...(dto.companyName !== undefined && { companyName: dto.companyName }),
          ...(dto.fiscalAddress !== undefined && { fiscalAddress: dto.fiscalAddress }),
        },
      });

      return clientProfile;
    });

    // M2 FIX: Audit log for onboarding
    await this.auditService.log({
      userId,
      action: 'ONBOARDING_COMPLETE',
      entityType: 'ClientProfile',
      entityId: result.id,
    });

    return {
      message: 'Onboarding completed successfully',
      clientProfile: result,
    };
  }

  // M3 FIX: Return missingFields array
  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        clientProfile: {
          select: {
            id: true,
            clientType: true,
            companyName: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const missingFields: string[] = [];
    if (!user.firstName) missingFields.push('firstName');
    if (!user.lastName) missingFields.push('lastName');
    if (!user.clientProfile) missingFields.push('clientProfile');
    if (!user.clientProfile?.clientType) missingFields.push('clientType');
    if (user.clientProfile?.clientType === 'CORPORATION' && !user.clientProfile?.companyName) {
      missingFields.push('companyName');
    }

    const isComplete = missingFields.length === 0;

    return { isComplete, missingFields };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // M4 FIX: Audit log for password change
    await this.auditService.log({
      userId,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Password changed successfully' };
  }
}
