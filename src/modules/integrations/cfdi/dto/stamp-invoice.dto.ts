import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StampInvoiceDto {
  @ApiPropertyOptional({ description: 'RFC del receptor' })
  @IsString()
  @IsOptional()
  receptorRfc?: string;

  @ApiPropertyOptional({ description: 'Uso del CFDI', default: 'G03' })
  @IsString()
  @IsOptional()
  usoCfdi?: string = 'G03';

  @ApiProperty({ description: 'Codigo postal del receptor' })
  @IsString()
  @IsNotEmpty()
  codigoPostalReceptor: string;

  @ApiPropertyOptional({ description: 'Regimen fiscal del receptor' })
  @IsString()
  @IsOptional()
  regimenFiscalReceptor?: string;

  @ApiPropertyOptional({ description: 'Regimen fiscal del emisor' })
  @IsString()
  @IsOptional()
  regimenFiscalEmisor?: string;

  @ApiPropertyOptional({ description: 'Clave de producto o servicio SAT' })
  @IsString()
  @IsOptional()
  claveProducto?: string;

  @ApiPropertyOptional({ description: 'Clave de unidad SAT' })
  @IsString()
  @IsOptional()
  claveUnidad?: string;

  @ApiProperty({ description: 'Forma de pago (01=Efectivo, 03=Transferencia, etc.)' })
  @IsString()
  @IsNotEmpty()
  formaPago: string;

  @ApiPropertyOptional({ description: 'Metodo de pago', default: 'PUE' })
  @IsString()
  @IsOptional()
  metodoPago?: string = 'PUE';
}
