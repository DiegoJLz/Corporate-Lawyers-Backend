import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

export interface SearchResultItem {
  id: string;
  score: number;
  [key: string]: unknown;
}

export interface SearchResults {
  cases: SearchResultItem[];
  documents: SearchResultItem[];
  notes: SearchResultItem[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    entities: string[] = ['cases', 'documents', 'notes'],
    limit = 10,
  ): Promise<{ results: SearchResults; totalResults: number }> {
    const searchTerm = query.trim();
    if (!searchTerm || searchTerm.length < 2) {
      return { results: { cases: [], documents: [], notes: [] }, totalResults: 0 };
    }

    const results: SearchResults = { cases: [], documents: [], notes: [] };
    let totalResults = 0;

    // C6 FIX: Use PostgreSQL full-text search with ts_vector/ts_query + ranking

    if (entities.includes('cases')) {
      const cases = await this.prisma.$queryRaw<SearchResultItem[]>`
        SELECT id, case_number AS "caseNumber", title, status,
               ts_rank(
                 to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(case_number, '')),
                 plainto_tsquery('spanish', ${searchTerm})
               ) AS score
        FROM cases
        WHERE deleted_at IS NULL
          AND to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(case_number, ''))
              @@ plainto_tsquery('spanish', ${searchTerm})
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      results.cases = cases;
      totalResults += cases.length;
    }

    if (entities.includes('documents')) {
      const documents = await this.prisma.$queryRaw<SearchResultItem[]>`
        SELECT id, title, type,
               ts_rank(
                 to_tsvector('spanish', coalesce(title, '') || ' ' || array_to_string(tags, ' ')),
                 plainto_tsquery('spanish', ${searchTerm})
               ) AS score
        FROM documents
        WHERE deleted_at IS NULL
          AND to_tsvector('spanish', coalesce(title, '') || ' ' || array_to_string(tags, ' '))
              @@ plainto_tsquery('spanish', ${searchTerm})
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      results.documents = documents;
      totalResults += documents.length;
    }

    if (entities.includes('notes')) {
      const notes = await this.prisma.$queryRaw<SearchResultItem[]>`
        SELECT cn.id, cn.case_id AS "caseId",
               substring(cn.content from 1 for 200) AS "contentPreview",
               ts_rank(
                 to_tsvector('spanish', coalesce(cn.content, '')),
                 plainto_tsquery('spanish', ${searchTerm})
               ) AS score
        FROM case_notes cn
        WHERE cn.deleted_at IS NULL
          AND to_tsvector('spanish', coalesce(cn.content, ''))
              @@ plainto_tsquery('spanish', ${searchTerm})
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      results.notes = notes;
      totalResults += notes.length;
    }

    return { results, totalResults };
  }
}
