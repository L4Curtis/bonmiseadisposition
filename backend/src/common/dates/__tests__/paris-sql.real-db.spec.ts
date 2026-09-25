/**
 * Fragments SQL de `common/dates/paris.ts` exécutés par un VRAI PostgreSQL.
 *
 * Pourquoi : les tests unitaires ne voient que le texte SQL. Seule la base
 * confirme que Postgres découpe les jours comme le code JavaScript, y compris
 * pour les instants entre 0 h et 2 h à Paris et quel que soit le réglage
 * `TimeZone` de la session.
 *
 * Aucune table n'est lue ni écrite : uniquement des `SELECT` d'expressions,
 * dans une transaction annulée à la fin.
 *
 * Exécution (base lancée) :
 *   cd backend && RUN_DB_TESTS=1 npx vitest run src/common/dates/__tests__/paris-sql.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CalendarGranularity,
  addDaysToIsoDate,
  parisBucketSql,
  parisDayEndExclusiveSql,
  parisDayStartSql,
  parisDayStartUtc,
  parisPeriodSql,
  parisTodaySql,
  todayInParis,
  utcToIsoDate,
} from '../paris';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

/** Instant UTC tel que Prisma le range dans une colonne `timestamp`. */
function utcTimestamp(instant: string): Prisma.Sql {
  return Prisma.sql`${instant}::timestamp`;
}

/** Annule la transaction une fois les assertions faites. */
class Rollback extends Error {}

describeDb('Fragments SQL « heure de Paris » (vraie base)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Exécute `check` avec un fuseau de session donné, puis annule tout. */
  async function withSessionTimeZone(zone: string, check: (tx: Prisma.TransactionClient) => Promise<void>) {
    await prisma
      .$transaction(async (tx) => {
        // set_config(…, true) = SET LOCAL : limité à cette transaction.
        await tx.$queryRaw(Prisma.sql`SELECT set_config('TimeZone', ${zone}, true)`);
        await check(tx);
        throw new Rollback();
      })
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  it.each(['UTC', 'Europe/Paris', 'America/New_York'])(
    'bornes de jour identiques à parisDayStartUtc (session en %s)',
    async (zone) => {
      await withSessionTimeZone(zone, async (tx) => {
        // Jours ordinaires d'été et d'hiver, deux changements d'heure (jours de
        // 23 h et de 25 h) et un 29 février.
        for (const day of ['2026-07-15', '2026-01-15', '2026-03-29', '2026-10-25', '2028-02-29']) {
          const [row] = await tx.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
            SELECT ${parisDayStartSql(day)} AS start, ${parisDayEndExclusiveSql(day)} AS "end"
          `);
          expect(row.start.toISOString()).toBe(parisDayStartUtc(day).toISOString());
          // Borne haute exclue : minuit à Paris du lendemain.
          expect(row.end.toISOString()).toBe(parisDayStartUtc(addDaysToIsoDate(day, 1)).toISOString());
        }
      });
    },
  );

  it.each<[CalendarGranularity, string, string]>([
    ['day', '2026-07-14 22:30:00', '2026-07-15'], // 0 h 30 à Paris, été
    ['day', '2026-01-14 23:30:00', '2026-01-15'], // 0 h 30 à Paris, hiver
    ['day', '2026-07-14 21:59:59', '2026-07-14'], // 23 h 59 à Paris
    ['day', '2026-03-29 00:30:00', '2026-03-29'], // 1 h 30 à Paris, jour du passage à l'heure d'été
    ['day', '2026-10-24 22:30:00', '2026-10-25'], // 0 h 30 à Paris, jour du retour à l'heure d'hiver
    ['day', '2028-02-28 23:30:00', '2028-02-29'], // 29 février 0 h 30 à Paris
    ['week', '2026-07-19 22:30:00', '2026-07-20'], // lundi 0 h 30 à Paris
    ['week', '2026-07-19 21:30:00', '2026-07-13'], // dimanche 23 h 30 à Paris : semaine précédente
    ['month', '2026-07-31 22:30:00', '2026-08-01'], // 1er août 0 h 30 à Paris
    ['month', '2026-02-28 23:30:00', '2026-03-01'], // 1er mars 0 h 30 à Paris
    ['month', '2028-02-29 22:59:59', '2028-02-01'], // 29 février 23 h 59 à Paris
  ])('regroupement %s de %s (UTC) → %s', async (granularity, instant, expected) => {
    await withSessionTimeZone('UTC', async (tx) => {
      const [row] = await tx.$queryRaw<{ bucket: Date }[]>(Prisma.sql`
        SELECT ${parisBucketSql(utcTimestamp(instant), granularity)} AS bucket
        GROUP BY 1
      `);
      expect(utcToIsoDate(row.bucket)).toBe(expected);
    });
  });

  it('période civile : un instant de 0 h 30 à Paris appartient au jour parisien', async () => {
    await withSessionTimeZone('UTC', async (tx) => {
      const range = { from: '2026-07-15', to: '2026-07-15' };
      const [row] = await tx.$queryRaw<{ night: boolean; eve: boolean }[]>(Prisma.sql`
        SELECT ${parisPeriodSql(utcTimestamp('2026-07-14 22:30:00'), range)} AS night,
               ${parisPeriodSql(utcTimestamp('2026-07-14 21:59:59'), range)} AS eve
      `);
      expect(row).toEqual({ night: true, eve: false });
    });
  });

  it('date du jour à Paris identique à todayInParis', async () => {
    const before = todayInParis();
    const [row] = await prisma.$queryRaw<{ today: Date }[]>(Prisma.sql`SELECT ${parisTodaySql()} AS today`);
    const after = todayInParis();
    expect([before, after]).toContain(utcToIsoDate(row.today));
  });
});
