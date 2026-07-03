import { IsOptional, IsUUID, IsBooleanString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TimeEntryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() lawyerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() isBillable?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() isBilled?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;

  constructor() { super(); this.sortBy = 'date'; }
}
