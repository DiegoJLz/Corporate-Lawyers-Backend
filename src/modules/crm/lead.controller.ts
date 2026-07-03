import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';
import { Public } from '../../core/security/decorators/public.decorator';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller({ version: '1', path: 'leads' })
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @ApiOperation({ summary: 'List leads (filtered by role)' })
  async findAll(
    @Query() query: LeadQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.leadService.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Create a new lead' })
  async create(
    @Body() dto: CreateLeadDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.leadService.create(dto, userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a lead from public website (rate limited)' })
  async createPublic(@Body() dto: CreateLeadDto) {
    return this.leadService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Update lead' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.leadService.update(id, dto, userId, role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete lead (only if NEW and no intake)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.remove(id);
  }

  @Patch(':id/assign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Assign lead to a lawyer or admin' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leadService.assign(id, dto);
  }

  @Post(':id/convert')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Convert lead to client (creates user + profile)' })
  async convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.leadService.convert(id, dto, userId);
  }

  @Post(':id/conflict-check')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Run conflict of interest check on lead' })
  async conflictCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.leadService.conflictCheck(id, userId);
  }

  @Get(':id/conflict-checks')
  @ApiOperation({ summary: 'Get conflict check history for lead' })
  async getConflictChecks(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.getConflictChecks(id);
  }
}
