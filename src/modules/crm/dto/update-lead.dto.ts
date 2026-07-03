import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { CreateLeadDto } from './create-lead.dto';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional({ example: 75, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
