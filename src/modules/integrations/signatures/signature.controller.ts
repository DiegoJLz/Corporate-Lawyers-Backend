import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SignatureService } from './signature.service';
import { CreateSignatureRequestDto } from './dto/create-signature-request.dto';
import { SignatureQueryDto } from './dto/signature-query.dto';
import { Roles } from '../../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../../core/security/decorators/current-user.decorator';

@ApiTags('Signatures')
@ApiBearerAuth()
@Controller({ version: '1', path: 'signatures' })
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'List all signature requests with filters' })
  async findAll(@Query() query: SignatureQueryDto) {
    return this.signatureService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Create a new signature request' })
  async createRequest(
    @Body() dto: CreateSignatureRequestDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.signatureService.createRequest(dto, userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get signature request by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.signatureService.findOne(id);
  }

}

@ApiTags('Documents - Signatures')
@ApiBearerAuth()
@Controller({ version: '1', path: 'documents' })
export class DocumentSignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Get(':id/signatures')
  @Roles(UserRole.ADMIN, UserRole.LAWYER, UserRole.CLIENT)
  @ApiOperation({ summary: 'Get all signatures for a document' })
  async getDocumentSignatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.signatureService.getDocumentSignatures(id);
  }
}
