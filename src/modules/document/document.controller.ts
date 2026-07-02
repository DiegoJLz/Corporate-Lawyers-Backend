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
  UseInterceptors,
  UploadedFile as NestUploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { LinkToCaseDto } from './dto/link-to-case.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller({ version: '1', path: 'documents' })
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @ApiOperation({ summary: 'List all documents with filters' })
  async findAll(
    @Query() query: DocumentQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.documentService.findAll(query, userId, role);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search documents by title' })
  async search(@Query('q') q: string) {
    return this.documentService.search(q);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        type: { type: 'string' },
        isConfidential: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        caseId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'title'],
    },
  })
  async upload(
    @NestUploadedFile() file: any,
    @Body() dto: UploadDocumentDto,
    @CurrentUser('userId') uploadedById: string,
  ) {
    return this.documentService.upload(file, dto, uploadedById);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.documentService.findOne(id, userId, role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete document (soft delete, admin only)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') performedBy: string,
  ) {
    return this.documentService.remove(id, performedBy);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL for a document' })
  async getDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentService.getDownloadUrl(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a document' })
  async getVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentService.getVersions(id);
  }

  @Get(':id/versions/:versionNumber/download')
  @ApiOperation({ summary: 'Download a specific version of a document' })
  async downloadVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber') versionNumber: number,
  ) {
    return this.documentService.downloadVersion(id, Number(versionNumber));
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new version of a document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        changeDescription: { type: 'string' },
      },
      required: ['file'],
    },
  })
  async uploadNewVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @NestUploadedFile() file: any,
    @Body('changeDescription') changeDescription: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.documentService.uploadNewVersion(
      id,
      file,
      changeDescription,
      userId,
    );
  }

  @Post(':id/link-case')
  @ApiOperation({ summary: 'Link a document to a case' })
  async linkToCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkToCaseDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.documentService.linkToCase(id, dto.caseId, userId);
  }

  @Delete(':id/link-case/:caseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a document from a case' })
  async unlinkFromCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.documentService.unlinkFromCase(id, caseId);
  }
}
