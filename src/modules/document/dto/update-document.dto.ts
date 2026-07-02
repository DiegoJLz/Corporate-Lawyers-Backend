import { OmitType, PartialType } from '@nestjs/swagger';
import { UploadDocumentDto } from './upload-document.dto';

export class UpdateDocumentDto extends PartialType(
  OmitType(UploadDocumentDto, ['caseId'] as const),
) {}
