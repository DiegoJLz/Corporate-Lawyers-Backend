import { IsNotEmpty, IsOptional, IsString, IsEnum, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientType } from '@prisma/client';

export class CompleteOnboardingDto {
  @ApiProperty({ minLength: 2 })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ minLength: 2 })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ClientType })
  @IsNotEmpty()
  @IsEnum(ClientType)
  clientType: ClientType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rfc?: string;

  @ApiPropertyOptional({ description: 'Required if clientType is CORPORATION' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fiscalAddress?: string;
}
