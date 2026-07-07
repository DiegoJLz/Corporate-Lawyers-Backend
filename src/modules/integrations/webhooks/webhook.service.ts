import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  // ─── Create ─────────────────────────────────────────────────

  async create(dto: CreateWebhookDto, userId: string) {
    const secret = crypto.randomBytes(32).toString('hex');

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        url: dto.url,
        secret,
        events: dto.events,
        description: dto.description,
        createdById: userId,
      },
    });

    this.logger.log(
      `Webhook endpoint created: ${endpoint.id} for URL ${dto.url}`,
    );

    return endpoint;
  }

  // ─── Find All ───────────────────────────────────────────────

  async findAll(query: WebhookQueryDto) {
    const where: Prisma.WebhookEndpointWhereInput = { deletedAt: null };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.event) {
      where.events = { has: query.event };
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.webhookEndpoint.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        select: {
          id: true,
          url: true,
          events: true,
          isActive: true,
          description: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          // DO NOT return secret in list responses
          _count: {
            select: { deliveries: true },
          },
        },
      }),
      this.prisma.webhookEndpoint.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
      },
    };
  }

  // ─── Find One ───────────────────────────────────────────────

  async findOne(id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, deletedAt: null },
    });

    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint with ID ${id} not found`);
    }

    // Secret is included on single-get
    return endpoint;
  }

  // ─── Update ─────────────────────────────────────────────────

  async update(id: string, dto: UpdateWebhookDto) {
    await this.findOne(id);

    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: dto.url,
        events: dto.events,
        description: dto.description,
        isActive: dto.isActive,
      },
    });

    this.logger.log(`Webhook endpoint updated: ${id}`);

    return endpoint;
  }

  // ─── Remove (Soft Delete) ──────────────────────────────────

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Webhook endpoint soft-deleted: ${id}`);
  }

  // ─── Get Deliveries ────────────────────────────────────────

  async getDeliveries(id: string, query: PaginationQueryDto) {
    await this.findOne(id);

    const where: Prisma.WebhookDeliveryWhereInput = { endpointId: id };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
      },
    };
  }

  // ─── Test Ping ─────────────────────────────────────────────

  async testPing(id: string) {
    const endpoint = await this.findOne(id);

    await this.webhookDispatcher.dispatch('ping', {
      message: 'Webhook test ping',
      endpointId: endpoint.id,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Test ping dispatched for endpoint: ${id}`);

    return { message: 'Ping dispatched' };
  }
}
