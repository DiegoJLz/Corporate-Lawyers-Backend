import { IsUUID, IsString, IsNumber, IsBoolean, IsOptional, IsDateString, Min, Max, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTimeEntryDto {
  @ApiProperty() @IsUUID() caseId: string;
  @ApiProperty({ example: 'Revisión de contrato de arrendamiento' }) @IsString() @MinLength(3) @MaxLength(500) description: string;
  @ApiProperty({ example: 2.5 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.25) @Max(24) hours: number;
  @ApiPropertyOptional({ example: 2500 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) rate?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isBillable?: boolean;
  @ApiProperty({ example: '2026-07-01' }) @IsDateString() date: string;
}
