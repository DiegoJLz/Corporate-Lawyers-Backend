import { IsUUID, IsString, IsNumber, IsArray, IsOptional, IsDateString, Min, Max, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @ApiProperty({ example: 'Honorarios por consultoría' }) @IsString() @MinLength(3) @MaxLength(500) description: string;
  @ApiProperty({ example: 1 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) quantity: number;
  @ApiProperty({ example: 5000 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsUUID() caseId: string;
  @ApiProperty() @IsUUID() clientProfileId: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional({ example: 0.16 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1) taxRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('4', { each: true }) timeEntryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('4', { each: true }) expenseIds?: string[];
  @ApiPropertyOptional({ type: [InvoiceItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items?: InvoiceItemDto[];
}
