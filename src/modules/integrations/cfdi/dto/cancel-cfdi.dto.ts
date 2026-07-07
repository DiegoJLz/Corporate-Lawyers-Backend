import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelCfdiDto {
  @ApiProperty({ description: 'Motivo de cancelacion', minLength: 10, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  motivo: string;
}
