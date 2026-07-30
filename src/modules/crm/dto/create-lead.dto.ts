import { IsString, IsEmail, IsOptional, IsEnum, IsIn, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'juan.perez@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.WEBSITE })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource = LeadSource.WEBSITE;

  @ApiPropertyOptional({ example: 'Derecho corporativo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  areaOfInterest?: string;

  @ApiPropertyOptional({ example: 'Necesito asesoría para constituir una empresa...' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @ApiPropertyOptional({ example: 'Grupo Legal S.A. de C.V.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ example: 'Ciudad de México' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'MEDIUM', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;
}
