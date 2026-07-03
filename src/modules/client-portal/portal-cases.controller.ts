import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalCasesService } from './portal-cases.service';
import { PortalCaseQueryDto } from './dto/portal-case-query.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Cases')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/cases' })
export class PortalCasesController {
  constructor(private readonly portalCasesService: PortalCasesService) {}

  @Get()
  @ApiOperation({ summary: 'List client cases' })
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: PortalCaseQueryDto,
  ) {
    return this.portalCasesService.findAll(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single case by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalCasesService.findOne(id, userId);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get case timeline (public entries only)' })
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.portalCasesService.getTimeline(id, userId, query);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'Get case notes (non-internal only)' })
  async getNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.portalCasesService.getNotes(id, userId, query);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get case documents (non-confidential only)' })
  async getDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.portalCasesService.getDocuments(id, userId, query);
  }
}
