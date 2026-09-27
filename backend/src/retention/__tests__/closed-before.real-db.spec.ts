/**
 * Rétention contre une VRAIE base : la limite porte sur la date de clôture
 * (`archivedAt`) ou d'annulation (`cancelledAt`), jamais sur `updatedAt`.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/retention/__tests__/closed-before.real-db.spec.ts
 */
import { BonStatus } from '@prisma/client';
import { CLOSED_BON_STATUSES } from '../../bons/bon-status';
import { PrismaService } from '../../prisma/prisma.service';
import { closedBeforeWhere } from '../closed-before';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-retention-2d';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface Fixture {
  key: string;
  status: BonStatus;
  closedYearsAgo: number | null;
  updatedYearsAgo: number;
}

const FIXTURES: readonly Fixture[] = [
  // Clôturé il y a 7 ans puis modifié techniquement hier : éligible.
  { key: 'clos-ancien-modifie', status: 'archived', closedYearsAgo: 7, updatedYearsAgo: 0 },
  // Clôturé l'an dernier, `updatedAt` ancien (reprise de données) : pas éligible.
  { key: 'clos-recent', status: 'archived', closedYearsAgo: 1, updatedYearsAgo: 10 },
  { key: 'annule-ancien', status: 'cancelled', closedYearsAgo: 8, updatedYearsAgo: 0 },
  { key: 'annule-recent', status: 'cancelled', closedYearsAgo: 2, updatedYearsAgo: 9 },
  // Clos avant l'existence des dates de clôture : repli sur updatedAt.
  { key: 'clos-sans-date', status: 'archived', closedYearsAgo: null, updatedYearsAgo: 7 },
  // Toujours en cours : jamais éligible.
  { key: 'en-cours', status: 'active', closedYearsAgo: null, updatedYearsAgo: 9 },
];

describeDb('Rétention : date de clôture (base réelle)', () => {
  let prisma: PrismaService;
  let filialeId: string;
  let userId: string;

  async function cleanup(): Promise<void> {
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanup();
    filialeId = (await prisma.filiale.create({ data: { name: `${TEST_PREFIX}-f`, displayName: 'F' } })).id;
    const user = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-u`, email: `${TEST_PREFIX}-u@test.local`, displayName: 'U' },
    });
    userId = user.id;
    const now = Date.now();
    for (const f of FIXTURES) {
      const closedAt = f.closedYearsAgo === null ? null : new Date(now - f.closedYearsAgo * YEAR_MS);
      const bon = await prisma.bon.create({
        data: {
          reference: `${TEST_PREFIX}-${f.key}`, filialeId, collaborateurId: user.id, createdById: user.id,
          civilite: 'mr', status: f.status, dateMiseDisposition: new Date(now - 11 * YEAR_MS),
          archivedAt: f.status === 'archived' ? closedAt : null,
          cancelledAt: f.status === 'cancelled' ? closedAt : null,
        },
      });
      await prisma.$executeRaw`UPDATE bons SET updated_at = ${new Date(now - f.updatedYearsAgo * YEAR_MS - 60_000)} WHERE id = ${bon.id}`;
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('retient les bons clos avant la limite, selon leur date de clôture', async () => {
    const cutoff = new Date(Date.now() - 5 * YEAR_MS);
    const bons = await prisma.bon.findMany({
      where: { AND: [closedBeforeWhere(cutoff), { filialeId }] },
      select: { reference: true },
      orderBy: { reference: 'asc' },
    });
    expect(bons.map((b) => b.reference.replace(`${TEST_PREFIX}-`, ''))).toEqual([
      'annule-ancien', 'clos-ancien-modifie', 'clos-sans-date',
    ]);
  });

  // Sécurité des données : l'anonymisation détruit les preuves. Un bon encore
  // ouvert ne doit JAMAIS être retenu, même si ses dates de clôture ou
  // d'annulation sont anciennes (bon rouvert par une contestation, donnée
  // reprise) et que sa dernière modification date de dix ans.
  it('ne retient jamais un bon encore ouvert, quelles que soient ses dates', async () => {
    const openStatuses = Object.values(BonStatus).filter((s) => !(CLOSED_BON_STATUSES as readonly string[]).includes(s));
    expect(openStatuses.length).toBeGreaterThan(0);
    const longAgo = new Date(Date.now() - 10 * YEAR_MS);
    const openFiliale = await prisma.filiale.create({ data: { name: `${TEST_PREFIX}-ouverts`, displayName: 'O' } });
    for (const status of openStatuses) {
      const bon = await prisma.bon.create({
        data: {
          reference: `${TEST_PREFIX}-ouvert-${status}`, filialeId: openFiliale.id, collaborateurId: userId,
          createdById: userId, civilite: 'mme', status, dateMiseDisposition: longAgo,
          archivedAt: longAgo, cancelledAt: longAgo,
        },
      });
      await prisma.$executeRaw`UPDATE bons SET updated_at = ${longAgo} WHERE id = ${bon.id}`;
    }
    const retained = await prisma.bon.count({
      where: { AND: [closedBeforeWhere(new Date()), { filialeId: openFiliale.id }] },
    });
    expect(retained).toBe(0);
  });
});
