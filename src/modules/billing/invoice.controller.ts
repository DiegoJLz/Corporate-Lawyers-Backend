import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { AddInvoiceItemDto } from './dto/add-invoice-item.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - Invoices')
@ApiBearerAuth()
@Controller({ version: '1', path: 'invoices' })
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  async findAll(@Query() query: InvoiceQueryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Create invoice from time entries + expenses' })
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser('userId') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get('summary/:caseId')
  @ApiOperation({ summary: 'Financial summary for a case' })
  async summary(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.service.getSummary(caseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update invoice (status transitions, metadata)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser('userId') userId: string) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete invoice (DRAFT only)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.service.remove(id, userId);
  }

  // ─── Invoice Items ──────────────────────────────────────────

  @Post(':id/items')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Add manual item to invoice' })
  async addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddInvoiceItemDto) {
    return this.service.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Update invoice item' })
  async updateItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: AddInvoiceItemDto) {
    return this.service.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Remove invoice item' })
  async removeItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.removeItem(id, itemId);
  }
}
