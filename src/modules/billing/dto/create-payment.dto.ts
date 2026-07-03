import { IsUUID, IsNumber, IsEnum, IsString, IsOptional, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty() @IsUUID() invoiceId: string;
  @ApiProperty({ example: 15000.00 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
}
