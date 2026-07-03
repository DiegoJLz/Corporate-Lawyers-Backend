import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationRestService } from './notification-rest.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ version: '1', path: 'notifications' })
export class NotificationRestController {
  constructor(
    private readonly notificationRestService: NotificationRestService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for current user' })
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationRestService.findAll(query, userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser('userId') userId: string) {
    return this.notificationRestService.getUnreadCount(userId);
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark notifications as read' })
  async markRead(
    @CurrentUser('userId') userId: string,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.notificationRestService.markRead(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single notification by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.notificationRestService.findOne(id, userId);
  }
}
