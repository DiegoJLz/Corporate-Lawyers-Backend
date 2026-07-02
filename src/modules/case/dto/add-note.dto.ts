import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddNoteDto {
  @ApiProperty({ example: 'El cliente confirmó la reunión del viernes' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({ description: 'true = internal (team only), false = visible to client', default: true })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
