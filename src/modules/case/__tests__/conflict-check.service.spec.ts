import { Test, TestingModule } from '@nestjs/testing';
import { ConflictCheckService } from '../conflict-check.service';
import { PrismaService } from '../../../core/database/prisma.service';

// ─── Fixtures ───────────────────────────────────────────────────────

function makePartyMatch(overrides: Partial<{
  name: string;
  role: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  caseStatus: string;
  caseDeletedAt: Date | null;
}> = {}) {
  return {
    id: 'party-1',
    name: overrides.name ?? 'Carlos Lopez Garcia',
    role: overrides.role ?? 'PLAINTIFF',
    case: {
      id: overrides.caseId ?? 'case-1',
      caseNumber: overrides.caseNumber ?? 'CORP-2026-00001',
      title: overrides.caseTitle ?? 'Juicio Mercantil',
      status: overrides.caseStatus ?? 'ACTIVE',
      deletedAt: overrides.caseDeletedAt ?? null,
    },
  };
}

describe('ConflictCheckService', () => {
  let service: ConflictCheckService;

  const mockPrismaCaseParty = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictCheckService,
        {
          provide: PrismaService,
          useValue: {
            get caseParty() { return mockPrismaCaseParty; },
          },
        },
      ],
    }).compile();

    service = module.get<ConflictCheckService>(ConflictCheckService);
  });

  // ─── checkByName ────────────────────────────────────────────────

  it('should return no conflict when name has no matches', async () => {
    mockPrismaCaseParty.findMany.mockResolvedValue([]);

    const result = await service.checkByName('Nombre Inexistente');

    expect(result).toEqual({ hasConflict: false, matches: [] });
    expect(mockPrismaCaseParty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'Nombre Inexistente', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('should return conflict when exact name match found', async () => {
    const party = makePartyMatch({ name: 'Carlos Lopez Garcia' });
    mockPrismaCaseParty.findMany.mockResolvedValue([party]);

    const result = await service.checkByName('Carlos Lopez Garcia');

    expect(result.hasConflict).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual({
      partyName: 'Carlos Lopez Garcia',
      partyRole: 'PLAINTIFF',
      caseId: 'case-1',
      caseNumber: 'CORP-2026-00001',
      caseTitle: 'Juicio Mercantil',
    });
  });

  it('should return conflict on partial (case-insensitive) name match', async () => {
    const party = makePartyMatch({ name: 'CARLOS LOPEZ GARCIA' });
    mockPrismaCaseParty.findMany.mockResolvedValue([party]);

    const result = await service.checkByName('carlos');

    expect(result.hasConflict).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].partyName).toBe('CARLOS LOPEZ GARCIA');
  });

  it('should return multiple matches across different cases', async () => {
    const parties = [
      makePartyMatch({
        name: 'Carlos Lopez',
        caseId: 'case-1',
        caseNumber: 'CORP-2026-00001',
        caseTitle: 'Caso A',
      }),
      makePartyMatch({
        name: 'Carlos Lopez Hernandez',
        role: 'DEFENDANT',
        caseId: 'case-2',
        caseNumber: 'CORP-2026-00002',
        caseTitle: 'Caso B',
      }),
    ];
    mockPrismaCaseParty.findMany.mockResolvedValue(parties);

    const result = await service.checkByName('Carlos Lopez');

    expect(result.hasConflict).toBe(true);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].caseId).toBe('case-1');
    expect(result.matches[1].caseId).toBe('case-2');
  });

  it('should filter out archived cases', async () => {
    const parties = [
      makePartyMatch({ name: 'Carlos Lopez', caseStatus: 'ACTIVE' }),
      makePartyMatch({
        name: 'Carlos Lopez',
        caseId: 'case-archived',
        caseStatus: 'ARCHIVED',
      }),
    ];
    mockPrismaCaseParty.findMany.mockResolvedValue(parties);

    const result = await service.checkByName('Carlos Lopez');

    expect(result.hasConflict).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].caseId).toBe('case-1');
  });

  it('should filter out deleted cases', async () => {
    const parties = [
      makePartyMatch({ name: 'Carlos Lopez', caseDeletedAt: null }),
      makePartyMatch({
        name: 'Carlos Lopez',
        caseId: 'case-deleted',
        caseDeletedAt: new Date('2026-06-01'),
      }),
    ];
    mockPrismaCaseParty.findMany.mockResolvedValue(parties);

    const result = await service.checkByName('Carlos Lopez');

    expect(result.hasConflict).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].caseId).toBe('case-1');
  });

  it('should handle short names (< 2 chars) gracefully by returning no conflict', async () => {
    const result = await service.checkByName('A');

    expect(result).toEqual({ hasConflict: false, matches: [] });
    expect(mockPrismaCaseParty.findMany).not.toHaveBeenCalled();
  });

  it('should return correct structure { hasConflict, matches[] }', async () => {
    mockPrismaCaseParty.findMany.mockResolvedValue([]);

    const result = await service.checkByName('Test Name');

    expect(result).toHaveProperty('hasConflict');
    expect(result).toHaveProperty('matches');
    expect(typeof result.hasConflict).toBe('boolean');
    expect(Array.isArray(result.matches)).toBe(true);
  });
});
