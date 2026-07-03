import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class PortalMessageQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Case UUID to filter messages' })
  @IsUUID()
  caseId: string;

  constructor() {
    super();
    this.sortBy = 'createdAt';
    this.sortOrder = 'asc';
  }
}
