import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitIntakeDto {
  @ApiProperty({
    example: {
      legalIssue: 'Constitución de sociedad',
      urgency: 'medium',
      budget: '50000-100000',
    },
  })
  @IsObject()
  responses: Record<string, unknown>;
}
