import { IsString, IsEnum, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyRole } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';

export class AddPartyDto {
  @ApiProperty({ example: 'Juan Pérez García' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: PartyRole })
  @IsEnum(PartyRole)
  role: PartyRole;

  @ApiPropertyOptional({ example: 'juan@ejemplo.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdatePartyDto extends PartialType(AddPartyDto) {}
