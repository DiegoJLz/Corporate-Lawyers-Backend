import { IsUUID, IsString, IsArray, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Case UUID' })
  @IsUUID()
  caseId: string;

  @ApiProperty({ description: 'Receiver user UUID' })
  @IsUUID()
  receiverId: string;

  @ApiProperty({ description: 'Message content', minLength: 1, maxLength: 10000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({ description: 'File attachment references', default: [] })
  @IsOptional()
  @IsArray()
  attachments: unknown[] = [];
}
