import { IsUUID, IsString, IsNumber, IsBoolean, IsOptional, IsDateString, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty() @IsUUID() caseId: string;
  @ApiProperty({ example: 'Viáticos para audiencia' }) @IsString() @MinLength(3) @MaxLength(500) description: string;
  @ApiProperty({ example: 1500.00 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isBillable?: boolean;
  @ApiProperty({ example: '2026-07-01' }) @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptUrl?: string;
}
