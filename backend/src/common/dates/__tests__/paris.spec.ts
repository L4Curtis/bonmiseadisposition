import { Prisma } from '@prisma/client';
import { useHostTimeZone } from '../../__tests__/helpers/host-time-zone';
import {
  PARIS_TIME_ZONE,
  addDaysToIsoDate,
  daysBetweenIsoDates,
  formatParisDate,
  formatParisDateTime,
  isIsoDateFormat,
  isRealCalendarDate,
  isoDateToUtc,
  parisBucketSql,
  parisDayEndExclusiveSql,
  parisDayStartSql,
  parisDayStartUtc,
  parisDaysSince,
  parisIsoDate,
  parisMidnightUtcSql,
  parisMonthStartUtc,
  parisPeriodSql,
  parisTodayAsDbDate,
  parisTodaySql,
  todayInParis,
  utcToIsoDate,
} from '../paris';

/** Instants qui tombent entre 0 h et 2 h à Paris : la veille en UTC. C'est là
 *  qu'un calcul fait dans le fuseau de la machine (UTC en production) se
 *  trompe de jour. */
const NIGHT_INSTANTS = [
  { season: 'été (UTC+2)', instant: '2026-07-14T22:30:00.000Z', parisDay: '2026-07-15', fr: '15/07/2026' },
  { season: 'été, 1 h 59', instant: '2026-07-14T23:59:00.000Z', parisDay: '2026-07-15', fr: '15/07/2026' },
  { season: 'hiver (UTC+1)', instant: '2026-01-14T23:30:00.000Z', parisDay: '2026-01-15', fr: '15/01/2026' },
  { season: 'passage à l’heure d’été', instant: '2026-03-29T00:30:00.000Z', parisDay: '2026-03-29', fr: '29/03/2026' },
  { season: 'retour à l’heure d’hiver', instant: '2026-10-24T22:30:00.000Z', parisDay: '2026-10-25', fr: '25/10/2026' },
  { season: '29 février', instant: '2028-02-28T23:30:00.000Z', parisDay: '2028-02-29', fr: '29/02/2028' },
] as const;

describe('dates à l’heure de Paris — sur un serveur réglé en UTC (production)', () => {
  useHostTimeZone('UTC');

  it.each(NIGHT_INSTANTS)('parisIsoDate : $season → $parisDay', ({ instant, parisDay }) => {
    expect(parisIsoDate(new Date(instant))).toBe(parisDay);
    expect(todayInParis(new Date(instant))).toBe(parisDay);
  });

  it.each(NIGHT_INSTANTS)('formatParisDate : $season → $fr', ({ instant, fr }) => {
    expect(formatParisDate(new Date(instant))).toBe(fr);
    expect(formatParisDate(instant)).toBe(fr);
  });

  it('formatParisDateTime : horodatage lisible à l’heure de Paris', () => {
    expect(formatParisDateTime(new Date('2026-09-24T12:05:09.000Z'))).toBe('2026-09-24 14:05:09');
    expect(formatParisDateTime(new Date('2026-01-14T23:30:00.000Z'))).toBe('2026-01-15 00:30:00');
  });
});

describe('dates à l’heure de Paris — sur une machine à l’ouest de l’UTC', () => {
  useHostTimeZone('America/New_York');

  it('une colonne @db.Date (minuit UTC) garde son jour civil', () => {
    // toLocaleDateString sans fuseau afficherait ici le 31/03/2026.
    expect(formatParisDate(new Date('2026-04-01T00:00:00.000Z'))).toBe('01/04/2026');
  });

  it('parisDayStartUtc ne dépend pas du fuseau de la machine', () => {
    expect(parisDayStartUtc('2026-09-24').toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });
});

describe('formatParisDate — valeurs absentes ou invalides', () => {
  it.each([null, undefined, ''])('%s → chaîne vide par défaut', (value) => {
    expect(formatParisDate(value)).toBe('');
  });

  it('accepte un texte de remplacement', () => {
    expect(formatParisDate(null, '—')).toBe('—');
  });

  it('une date illisible donne le texte de remplacement, jamais une exception', () => {
    expect(formatParisDate('pas une date', '—')).toBe('—');
  });
});

describe('validation d’une date civile AAAA-MM-JJ', () => {
  it.each(['2026-09-24', '2024-02-29', '2026-12-31'])('%s est valide', (value) => {
    expect(isIsoDateFormat(value)).toBe(true);
    expect(isRealCalendarDate(value)).toBe(true);
  });

  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31'])(
    '%s a le bon format mais n’existe pas',
    (value) => {
      expect(isIsoDateFormat(value)).toBe(true);
      expect(isRealCalendarDate(value)).toBe(false);
    },
  );

  it.each(['24/09/2026', '2026-9-24', 'demain', '', '2026-09-24T00:00'])('%s est refusé', (value) => {
    expect(isIsoDateFormat(value)).toBe(false);
    expect(isRealCalendarDate(value)).toBe(false);
  });
});

describe('arithmétique des dates civiles', () => {
  it('isoDateToUtc / utcToIsoDate : représentation @db.Date (minuit UTC)', () => {
    expect(isoDateToUtc('2026-09-24').toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(utcToIsoDate(new Date('2026-09-24T00:00:00.000Z'))).toBe('2026-09-24');
  });

  it('addDaysToIsoDate franchit les mois, les années et les années bissextiles', () => {
    expect(addDaysToIsoDate('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToIsoDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToIsoDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysToIsoDate('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('daysBetweenIsoDates compte des jours calendaires, changement d’heure compris', () => {
    expect(daysBetweenIsoDates('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenIsoDates('2026-09-24', '2026-09-24')).toBe(0);
    expect(daysBetweenIsoDates('2026-09-24', '2026-09-20')).toBe(-4);
  });
});

describe('bornes de jour et de mois (instants UTC)', () => {
  it('parisDayStartUtc : minuit à Paris en été = 22 h UTC la veille', () => {
    expect(parisDayStartUtc('2026-09-24').toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });

  it('parisDayStartUtc : minuit à Paris en hiver = 23 h UTC la veille', () => {
    expect(parisDayStartUtc('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it('parisDayStartUtc : jours de changement d’heure', () => {
    expect(parisDayStartUtc('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(parisDayStartUtc('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });

  it.each([
    ['1er mars 0 h 30 à Paris (hiver)', '2026-02-28T23:30:00.000Z', '2026-02-28T23:00:00.000Z'],
    ['1er août 0 h 30 à Paris (été)', '2026-07-31T22:30:00.000Z', '2026-07-31T22:00:00.000Z'],
    ['1er avril 1 h 59, juste après le passage à l’heure d’été', '2026-03-31T23:59:00.000Z', '2026-03-31T22:00:00.000Z'],
    ['milieu du mois', '2026-09-15T10:00:00.000Z', '2026-08-31T22:00:00.000Z'],
    ['31 octobre 23 h 30 à Paris (hiver)', '2026-10-31T22:30:00.000Z', '2026-09-30T22:00:00.000Z'],
  ])('parisMonthStartUtc : %s', (_label, now, expected) => {
    expect(parisMonthStartUtc(new Date(now)).toISOString()).toBe(expected);
  });

  it('parisTodayAsDbDate : jour civil de Paris au format d’une colonne @db.Date', () => {
    // 22 h 30 UTC le 17 = 0 h 30 le 18 à Paris.
    expect(parisTodayAsDbDate(new Date('2026-09-17T22:30:00.000Z'))).toEqual(new Date('2026-09-18T00:00:00.000Z'));
  });

  it('parisDaysSince : jours calendaires écoulés depuis une colonne @db.Date', () => {
    const now = new Date('2026-09-17T22:30:00.000Z'); // 18/09 à Paris
    expect(parisDaysSince(new Date('2026-09-18T00:00:00.000Z'), now)).toBe(0);
    expect(parisDaysSince(new Date('2026-09-01T00:00:00.000Z'), now)).toBe(17);
    expect(parisDaysSince(new Date('2026-09-25T00:00:00.000Z'), now)).toBe(-7);
  });
});

describe('fragments SQL (Prisma.sql)', () => {
  const col = Prisma.sql`b.created_at`;

  it('le fuseau est écrit en clair dans le SQL, jamais passé en paramètre', () => {
    // Un paramètre différent dans le SELECT et le GROUP BY empêcherait
    // Postgres de reconnaître deux expressions identiques.
    expect(parisDayStartSql('2026-01-01').sql).toContain(`AT TIME ZONE '${PARIS_TIME_ZONE}'`);
    expect(parisDayStartSql('2026-01-01').values).toEqual(['2026-01-01']);
  });

  it('parisDayStartSql : minuit à Paris ramené en horodatage UTC sans fuseau', () => {
    const frag = parisDayStartSql('2026-07-15');
    expect(frag.sql).toBe(`((?::date::timestamp AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC')`);
  });

  it('parisDayEndExclusiveSql : minuit du lendemain', () => {
    const frag = parisDayEndExclusiveSql('2026-07-15');
    expect(frag.sql).toBe(`(((?::date + 1)::timestamp AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC')`);
    expect(frag.values).toEqual(['2026-07-15']);
  });

  it('parisPeriodSql : colonne >= début AND colonne < lendemain de la fin', () => {
    const frag = parisPeriodSql(col, { from: '2026-01-01', to: '2026-01-31' });
    expect(frag.sql).toMatch(/^b\.created_at >= .+ AND b\.created_at < .+$/);
    expect(frag.values).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('parisMidnightUtcSql : minuit à Paris d’une expression SQL de type date', () => {
    const frag = parisMidnightUtcSql(Prisma.sql`LEAST(bk.d + interval '1 day', ${'2026-07-15'}::date + 1)`);
    expect(frag.sql).toBe(
      `((LEAST(bk.d + interval '1 day', ?::date + 1)::timestamp AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC')`,
    );
    expect(frag.values).toEqual(['2026-07-15']);
  });

  it.each(['day', 'week', 'month'] as const)('parisBucketSql(%s) : convertit depuis UTC puis vers Paris', (granularity) => {
    const frag = parisBucketSql(col, granularity);
    expect(frag.sql).toBe(`date_trunc(?::text, (b.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date`);
    expect(frag.values).toEqual([granularity]);
  });

  it('parisTodaySql : date du jour à Paris', () => {
    expect(parisTodaySql().sql).toBe(`(now() AT TIME ZONE 'Europe/Paris')::date`);
  });
});
