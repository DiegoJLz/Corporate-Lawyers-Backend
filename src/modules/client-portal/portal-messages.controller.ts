import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalMessagesService } from './portal-messages.service';
import { PortalMessageQueryDto } from './dto/portal-message-query.dto';
import { PortalSendMessageDto } from './dto/portal-send-message.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Messages')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/messages' })
export class PortalMessagesController {
  constructor(private readonly portalMessagesService: PortalMessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get message conversations grouped by case' })
  async getConversations(
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalMessagesService.getConversations(userId);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread message counts by case' })
  async getUnreadCounts(
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalMessagesService.getUnreadCounts(userId);
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'Get messages for a specific case (auto-marks as read)' })
  async getMessages(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query() query: PortalMessageQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalMessagesService.getMessages(caseId, userId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Send a message to lead attorney or admin' })
  async send(
    @Body() dto: PortalSendMessageDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalMessagesService.send(userId, dto);
  }
}
