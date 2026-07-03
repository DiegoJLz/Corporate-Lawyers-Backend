import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CaseStatus, CaseType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class PortalCaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CaseStatus })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @ApiPropertyOptional({ enum: CaseType })
  @IsOptional()
  @IsEnum(CaseType)
  type?: CaseType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  constructor() {
    super();
    this.sortBy = 'updatedAt';
  }
}
