import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

export class UpdateInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1) taxRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ enum: InvoiceStatus }) @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
}
