import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkToCaseDto {
  @ApiProperty({ description: 'ID of the case to link the document to' })
  @IsUUID()
  caseId: string;
}
