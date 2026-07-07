import { Controller, Post, Get, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CfdiService } from './cfdi.service';
import { StampInvoiceDto } from './dto/stamp-invoice.dto';
import { CancelCfdiDto } from './dto/cancel-cfdi.dto';
import { Roles } from '../../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - CFDI')
@ApiBearerAuth()
@Controller({ version: '1', path: 'invoices' })
export class CfdiController {
  constructor(private readonly cfdiService: CfdiService) {}

  @Post(':id/cfdi/stamp')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Stamp CFDI for an invoice' })
  async stamp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StampInvoiceDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.cfdiService.stampInvoice(id, dto, userId);
  }

  @Post(':id/cfdi/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel CFDI for an invoice' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCfdiDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.cfdiService.cancelCfdi(id, dto, userId);
  }

  @Get(':id/cfdi/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get CFDI status for an invoice' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.cfdiService.getStatus(id);
  }

  @Get(':id/cfdi/xml')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER, UserRole.CLIENT)
  @ApiOperation({ summary: 'Download CFDI XML' })
  async downloadXml(@Param('id', ParseUUIDPipe) id: string) {
    return this.cfdiService.downloadXml(id);
  }
}
