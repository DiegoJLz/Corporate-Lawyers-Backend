import { Controller, Get, Post, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - Payments')
@ApiBearerAuth()
@Controller({ version: '1', path: 'payments' })
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @ApiOperation({ summary: 'List payments' })
  async findAll(@Query() query: PaymentQueryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Register payment' })
  async create(@Body() dto: CreatePaymentDto, @CurrentUser('userId') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}
