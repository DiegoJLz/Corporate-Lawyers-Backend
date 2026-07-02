import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseAssignmentRole } from '@prisma/client';

export class AssignLawyerDto {
  @ApiProperty({ description: 'User UUID (must be LAWYER or ASSISTANT)' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ enum: CaseAssignmentRole, default: 'CO_COUNSEL' })
  @IsOptional()
  @IsEnum(CaseAssignmentRole)
  role?: CaseAssignmentRole;
}
