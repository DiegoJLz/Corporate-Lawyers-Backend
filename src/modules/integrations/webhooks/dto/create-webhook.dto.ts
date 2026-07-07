import {
  IsUrl,
  IsArray,
  IsString,
  IsOptional,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl()
  url: string;

  @ApiProperty({ type: [String], minItems: 1, example: ['document.signed', 'case.updated'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
