import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller({ version: '1', path: 'search' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global full-text search across cases, documents, and notes' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'entities', required: false, description: 'Comma-separated: cases,documents,notes' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per entity (default 10)' })
  async search(
    @Query('q') q: string,
    @Query('entities') entities?: string,
    @Query('limit') limit?: number,
  ) {
    const entityList = entities ? entities.split(',').map((e) => e.trim()) : undefined;
    const result = await this.searchService.search(q, entityList, limit ?? 10);

    return {
      ...result.results,
      meta: { totalResults: result.totalResults, query: q },
    };
  }
}
