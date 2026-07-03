import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MessageQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Case UUID to filter messages' })
  @IsUUID()
  caseId: string;

  sortBy: string = 'createdAt';

  sortOrder: 'asc' | 'desc' = 'asc';
}
