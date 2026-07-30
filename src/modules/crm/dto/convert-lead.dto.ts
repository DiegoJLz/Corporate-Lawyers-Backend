import { IsString, IsOptional, IsEnum, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientType, CaseType } from '@prisma/client';

export class ConvertLeadDto {
  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: ClientType, default: ClientType.INDIVIDUAL })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType = ClientType.INDIVIDUAL;

  @ApiPropertyOptional({ example: 'XAXX010101000' })
  @IsOptional()
  @IsString()
  rfc?: string;

  @ApiPropertyOptional({ example: 'Empresa S.A. de C.V.' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ description: 'Lawyer ID to assign to auto-created case' })
  @IsOptional()
  @IsUUID()
  assignedLawyerId?: string;

  @ApiPropertyOptional({ example: 'Caso Laboral - Juan Pérez' })
  @IsOptional()
  @IsString()
  caseTitle?: string;

  @ApiPropertyOptional({ enum: CaseType })
  @IsOptional()
  @IsEnum(CaseType)
  caseType?: CaseType;
}
