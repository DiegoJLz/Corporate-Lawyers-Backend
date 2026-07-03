import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalDocumentsService } from './portal-documents.service';
import { PortalDocumentQueryDto } from './dto/portal-document-query.dto';
import { ClientOnlyGuard } from './guards/client-only.guard';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Client Portal - Documents')
@ApiBearerAuth()
@UseGuards(ClientOnlyGuard)
@Controller({ version: '1', path: 'portal/documents' })
export class PortalDocumentsController {
  constructor(private readonly portalDocumentsService: PortalDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents accessible to the client' })
  async findAll(
    @Query() query: PortalDocumentQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalDocumentsService.findAll(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific document by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalDocumentsService.findOne(id, userId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL for a document' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portalDocumentsService.download(id, userId);
  }
}
