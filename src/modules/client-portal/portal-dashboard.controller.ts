import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalDashboardService } from './portal-dashboard.service';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Dashboard')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/dashboard' })
export class PortalDashboardController {
  constructor(
    private readonly portalDashboardService: PortalDashboardService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get client dashboard overview' })
  async getDashboard(@CurrentUser('userId') userId: string) {
    return this.portalDashboardService.getDashboard(userId);
  }
}
