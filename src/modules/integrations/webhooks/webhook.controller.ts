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
import { UserRole } from '@prisma/client';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Roles } from '../../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../../core/security/decorators/current-user.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ version: '1', path: 'webhooks' })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @ApiOperation({ summary: 'List all webhook endpoints' })
  async findAll(@Query() query: WebhookQueryDto) {
    return this.webhookService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new webhook endpoint' })
  async create(
    @Body() dto: CreateWebhookDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.webhookService.create(dto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get webhook endpoint by ID (includes secret)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook endpoint' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhookService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete webhook endpoint (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookService.remove(id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get delivery history for a webhook endpoint' })
  async getDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.webhookService.getDeliveries(id, query);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test ping to a webhook endpoint' })
  async testPing(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookService.testPing(id);
  }
}
