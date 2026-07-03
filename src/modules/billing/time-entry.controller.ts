import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TimeEntryService } from './time-entry.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeEntryQueryDto } from './dto/time-entry-query.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - Time Entries')
@ApiBearerAuth()
@Controller({ version: '1', path: 'time-entries' })
export class TimeEntryController {
  constructor(private readonly service: TimeEntryService) {}

  @Get()
  @ApiOperation({ summary: 'List time entries' })
  async findAll(@Query() query: TimeEntryQueryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Create time entry' })
  async create(@Body() dto: CreateTimeEntryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.create(dto, userId, role);
  }

  @Get('summary/:caseId')
  @ApiOperation({ summary: 'Get time entry summary for a case' })
  async summary(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.service.getSummary(caseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get time entry by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update time entry' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTimeEntryDto, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.update(id, dto, userId, role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete time entry' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @CurrentUser('role') role: string) {
    return this.service.remove(id, userId, role);
  }
}
