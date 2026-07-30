import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalProfileService } from './portal-profile.service';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Profile')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/profile' })
export class PortalProfileController {
  constructor(private readonly portalProfileService: PortalProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get client profile' })
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.portalProfileService.getProfile(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update client profile' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.portalProfileService.updateProfile(userId, dto);
  }

  @Post('onboarding')
  @ApiOperation({ summary: 'Complete client onboarding' })
  async completeOnboarding(
    @CurrentUser('userId') userId: string,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.portalProfileService.completeOnboarding(userId, dto);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity for client' })
  async getActivity(@CurrentUser('userId') userId: string) {
    return this.portalProfileService.getActivity(userId);
  }

  @Get('session')
  @ApiOperation({ summary: 'Get current session info' })
  async getCurrentSession(@CurrentUser('userId') userId: string) {
    return this.portalProfileService.getCurrentSession(userId);
  }

  @Get('onboarding-status')
  @ApiOperation({ summary: 'Get onboarding status' })
  async getOnboardingStatus(@CurrentUser('userId') userId: string) {
    return this.portalProfileService.getOnboardingStatus(userId);
  }

  @Patch('change-password')
  @ApiOperation({ summary: 'Change client password' })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.portalProfileService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
