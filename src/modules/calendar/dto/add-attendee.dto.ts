import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendeeStatus } from '@prisma/client';

export class AddAttendeeDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ enum: AttendeeStatus, default: AttendeeStatus.TENTATIVE })
  @IsOptional()
  @IsEnum(AttendeeStatus)
  status?: AttendeeStatus = AttendeeStatus.TENTATIVE;
}
