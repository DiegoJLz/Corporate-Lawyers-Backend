import { IsString, IsNumber, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddInvoiceItemDto {
  @ApiProperty({ example: 'Consultoría adicional' }) @IsString() @MinLength(3) @MaxLength(500) description: string;
  @ApiProperty({ example: 2 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) quantity: number;
  @ApiProperty({ example: 3000 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
}
