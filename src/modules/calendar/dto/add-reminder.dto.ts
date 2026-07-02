import { IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class AddReminderDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ example: 30, minimum: 5, maximum: 10080 })
  @IsInt()
  @Min(5)
  @Max(10080)
  minutesBefore: number;
}
