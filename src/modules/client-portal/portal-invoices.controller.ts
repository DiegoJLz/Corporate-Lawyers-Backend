import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalInvoicesService } from './portal-invoices.service';
import { PortalInvoiceQueryDto } from './dto/portal-invoice-query.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Invoices')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/invoices' })
export class PortalInvoicesController {
  constructor(private readonly portalInvoicesService: PortalInvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices for the client (excludes DRAFT)' })
  async findAll(
    @Query() query: PortalInvoiceQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalInvoicesService.findAll(query, userId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary for the client' })
  async getSummary(
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalInvoicesService.getSummary(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID with items and payments' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalInvoicesService.findOne(id, userId);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Get payments for a specific invoice' })
  async getPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalInvoicesService.getPayments(id, userId);
  }
}
