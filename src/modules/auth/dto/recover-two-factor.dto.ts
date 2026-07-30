import { IsEmail, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecoverTwoFactorDto {
  @ApiProperty({ example: 'juan.perez@firma.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'A1B2C3D4', description: '8-character recovery code' })
  @IsString()
  @Length(8, 8)
  recoveryCode: string;
}
