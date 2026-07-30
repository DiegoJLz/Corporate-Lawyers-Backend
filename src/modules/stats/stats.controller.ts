import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StatsService } from './stats.service';
import { Roles } from '../../core/security/decorators/roles.decorator';

@ApiTags('Stats')
@ApiBearerAuth()
@Controller({ version: '1', path: 'stats' })
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user stats grouped by role and status' })
  async getUserStats() {
    return this.statsService.getUserStats();
  }

  @Get('cases')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get case stats grouped by status' })
  async getCaseStats() {
    return this.statsService.getCaseStats();
  }

  @Get('documents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get document stats grouped by type' })
  async getDocumentStats() {
    return this.statsService.getDocumentStats();
  }

  @Get('time-entries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get time entry stats (optionally by case)' })
  async getTimeEntryStats(@Query('caseId') caseId?: string) {
    return this.statsService.getTimeEntryStats(caseId);
  }

  @Get('expenses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get expense stats (optionally by case)' })
  async getExpenseStats(@Query('caseId') caseId?: string) {
    return this.statsService.getExpenseStats(caseId);
  }

  @Get('invoices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get invoice stats (optionally by case)' })
  async getInvoiceStats(@Query('caseId') caseId?: string) {
    return this.statsService.getInvoiceStats(caseId);
  }

  @Get('payments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get payment collection stats' })
  async getPaymentStats() {
    return this.statsService.getPaymentStats();
  }

  @Get('leads')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get lead stats grouped by status' })
  async getLeadStats() {
    return this.statsService.getLeadStats();
  }

  @Get('signatures')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get signature stats grouped by status' })
  async getSignatureStats() {
    return this.statsService.getSignatureStats();
  }
}
