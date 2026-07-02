import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: CaseStatus })
  @IsEnum(CaseStatus)
  status: CaseStatus;

  @ApiPropertyOptional({ example: 'Se resolvió a favor del demandante' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
