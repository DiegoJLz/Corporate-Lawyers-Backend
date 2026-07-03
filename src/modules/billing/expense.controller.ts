import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - Expenses')
@ApiBearerAuth()
@Controller({ version: '1', path: 'expenses' })
export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}

  @Get()
  @ApiOperation({ summary: 'List expenses' })
  async findAll(@Query() query: ExpenseQueryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER, UserRole.ASSISTANT)
  @ApiOperation({ summary: 'Create expense' })
  async create(@Body() dto: CreateExpenseDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.create(dto, userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expense by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findOne(id, userId, role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update expense' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.update(id, dto, userId, role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete expense' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.remove(id, userId, role);
  }
}
