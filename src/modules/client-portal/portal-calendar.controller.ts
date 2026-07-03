import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalCalendarService } from './portal-calendar.service';
import { PortalEventQueryDto } from './dto/portal-event-query.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Calendar')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/calendar' })
export class PortalCalendarController {
  constructor(private readonly portalCalendarService: PortalCalendarService) {}

  @Get()
  @ApiOperation({ summary: 'List events for the client' })
  async findAll(
    @Query() query: PortalEventQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalCalendarService.findAll(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalCalendarService.findOne(id, userId);
  }
}
