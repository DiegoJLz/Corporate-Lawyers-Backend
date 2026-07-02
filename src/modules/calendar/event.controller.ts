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
import { UserRole, AttendeeStatus } from '@prisma/client';
import { EventService } from './event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { AddAttendeeDto } from './dto/add-attendee.dto';
import { AddReminderDto } from './dto/add-reminder.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller({ version: '1', path: 'events' })
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() dto: CreateEventDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.eventService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List events with filters' })
  async findAll(
    @Query() query: EventQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventService.findAll(query, userId, userRole);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update event (creator or admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventService.update(id, dto, userId, userRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete event (creator or admin)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventService.remove(id, userId, userRole);
  }

  // ─── Attendees ───────────────────────────────────────────────

  @Get(':id/attendees')
  @ApiOperation({ summary: 'Get event attendees' })
  async getAttendees(@Param('id', ParseUUIDPipe) id: string) {
    const event = await this.eventService.findOne(id);
    return event.attendees;
  }

  @Post(':id/attendees')
  @ApiOperation({ summary: 'Add attendee to event' })
  async addAttendee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAttendeeDto,
  ) {
    return this.eventService.addAttendee(id, dto);
  }

  @Patch(':id/attendees/:userId')
  @ApiOperation({ summary: 'Update attendee status' })
  async updateAttendeeStatus(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('status') status: AttendeeStatus,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('role') currentUserRole: UserRole,
  ) {
    return this.eventService.updateAttendeeStatus(
      eventId,
      userId,
      status,
      currentUserId,
      currentUserRole,
    );
  }

  @Delete(':id/attendees/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove attendee from event' })
  async removeAttendee(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.eventService.removeAttendee(eventId, userId);
  }

  // ─── Reminders ───────────────────────────────────────────────

  @Post(':id/reminders')
  @ApiOperation({ summary: 'Add reminder to event' })
  async addReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddReminderDto,
  ) {
    return this.eventService.addReminder(id, dto);
  }

  @Delete(':id/reminders/:reminderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove reminder from event' })
  async removeReminder(
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
  ) {
    return this.eventService.removeReminder(reminderId);
  }
}

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller({ version: '1', path: 'calendar' })
export class CalendarController {
  constructor(private readonly eventService: EventService) {}

  @Get('availability/:userId')
  @ApiOperation({ summary: 'Get user availability for a date range' })
  async getAvailability(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.eventService.getAvailability(userId, dateFrom, dateTo);
  }
}
