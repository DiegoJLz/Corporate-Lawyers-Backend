import { IsString, IsEnum, IsUUID, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseType, CasePriority } from '@prisma/client';

export class CreateCaseDto {
  @ApiProperty({ example: 'Juicio Mercantil - Empresa X vs Empresa Y' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: CaseType })
  @IsEnum(CaseType)
  type: CaseType;

  @ApiPropertyOptional({ enum: CasePriority, default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @ApiPropertyOptional({ example: 'Derecho Mercantil' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  legalArea?: string;

  @ApiPropertyOptional({ example: 'Juzgado 5to Civil' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  court?: string;

  @ApiPropertyOptional({ example: 'EXP-2026/12345' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  courtFileNumber?: string;

  @ApiProperty({ description: 'Client profile UUID' })
  @IsUUID()
  clientProfileId: string;

  @ApiProperty({ description: 'Lead attorney user UUID' })
  @IsUUID()
  assignedLawyerId: string;
}
