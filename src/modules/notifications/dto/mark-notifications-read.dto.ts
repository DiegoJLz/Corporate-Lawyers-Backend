import { IsOptional, IsUUID, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    description: 'Array of notification IDs to mark as read. If omitted, marks ALL as read.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  notificationIds?: string[];
}
