import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

export interface ConflictMatch {
  partyName: string;
  partyRole: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  matches: ConflictMatch[];
}

@Injectable()
export class ConflictCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async checkByName(name: string): Promise<ConflictCheckResult> {
    if (!name || name.trim().length < 2) {
      return { hasConflict: false, matches: [] };
    }

    const parties = await this.prisma.caseParty.findMany({
      where: {
        name: { contains: name.trim(), mode: 'insensitive' },
      },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    // Filter out archived/deleted cases
    const activeMatches = parties.filter(
      (p) => p.case.deletedAt === null && p.case.status !== 'ARCHIVED',
    );

    const matches: ConflictMatch[] = activeMatches.map((p) => ({
      partyName: p.name,
      partyRole: p.role,
      caseId: p.case.id,
      caseNumber: p.case.caseNumber,
      caseTitle: p.case.title,
    }));

    return {
      hasConflict: matches.length > 0,
      matches,
    };
  }
}
