import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessageService } from './message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Messaging')
@ApiBearerAuth()
@Controller({ version: '1', path: 'messages' })
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  @ApiOperation({ summary: 'List messages for a case (paginated, auto-marks as read)' })
  async findAll(
    @Query() query: MessageQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.messageService.findAll(query.caseId, userId, role, query);
  }

  @Post()
  @ApiOperation({ summary: 'Send a message within a case' })
  async send(
    @Body() dto: SendMessageDto,
    @CurrentUser('userId') senderId: string,
  ) {
    return this.messageService.send(dto, senderId);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread message counts grouped by case' })
  async getUnreadCounts(
    @CurrentUser('userId') userId: string,
  ) {
    return this.messageService.getUnreadCounts(userId);
  }

  @Get('unread/:caseId')
  @ApiOperation({ summary: 'Get unread message count for a specific case' })
  async getUnreadCountForCase(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messageService.getUnreadCountForCase(caseId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single message by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messageService.findOne(id, userId);
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark messages as read (batch)' })
  async markRead(
    @Body() dto: MarkReadDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messageService.markRead(dto.messageIds, userId);
  }
}
