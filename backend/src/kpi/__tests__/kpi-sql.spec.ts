import { Prisma } from '@prisma/client';
import {
  bucketExpr,
  bucketLabel,
  compared,
  filialeFilter,
  inRange,
  parisEndExclusive,
  parisStart,
  ratio,
  stepInterval,
  toNumber,
} from '../kpi-sql';

describe('kpi-sql', () => {
  describe('toNumber', () => {
    it('convertit un bigint', () => {
      expect(toNumber(5n)).toBe(5);
    });

    it('convertit une chaîne numérique', () => {
      expect(toNumber('3.5')).toBe(3.5);
    });

    it('convertit un objet Decimal (méthode toNumber)', () => {
      expect(toNumber({ toNumber: () => 2 })).toBe(2);
    });

    it('convertit null en 0', () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
    });

    it('laisse passer un number', () => {
      expect(toNumber(4)).toBe(4);
    });

    it('renvoie 0 pour une chaîne non numérique', () => {
      expect(toNumber('abc')).toBe(0);
    });
  });

  describe('ratio', () => {
    it('renvoie null si le dénominateur est 0', () => {
      expect(ratio(5, 0)).toBeNull();
    });

    it('calcule le ratio sinon', () => {
      expect(ratio(1, 4)).toBe(0.25);
    });
  });

  describe('compared', () => {
    it('enveloppe courant/précédent', () => {
      expect(compared(10, 7)).toEqual({ current: 10, previous: 7 });
    });
  });

  describe('filialeFilter', () => {
    it('renvoie Prisma.empty si filialeId absent', () => {
      expect(filialeFilter('b', undefined)).toBe(Prisma.empty);
    });

    it('renvoie une condition sur l’alias donné sinon', () => {
      const frag = filialeFilter('b', 'filiale-1');
      expect(frag.sql).toContain('b.filiale_id');
      expect(frag.values).toContain('filiale-1');
    });
  });

  describe('inRange', () => {
    it('contient AT TIME ZONE Europe/Paris sur les deux bornes', () => {
      const col = Prisma.raw('b.created_at');
      const frag = inRange(col, { from: '2026-01-01', to: '2026-01-31' });
      expect(frag.sql).toContain("AT TIME ZONE 'Europe/Paris'");
      expect(frag.sql).toContain('>=');
      expect(frag.sql).toContain('<');
    });
  });

  describe('bucketExpr', () => {
    it('contient date_trunc et AT TIME ZONE Europe/Paris', () => {
      const col = Prisma.raw('b.created_at');
      const frag = bucketExpr(col, 'week');
      expect(frag.sql).toContain('date_trunc');
      expect(frag.sql).toContain("AT TIME ZONE 'Europe/Paris'");
    });
  });

  describe('stepInterval', () => {
    it.each([
      ['day', '1 day'],
      ['week', '1 week'],
      ['month', '1 month'],
    ] as const)('%s → %s', (granularity, expected) => {
      const frag = stepInterval(granularity);
      expect(frag.values).toContain(expected);
      expect(frag.sql).toContain('::interval');
    });
  });

  describe('bucketLabel', () => {
    it('formate un Date en YYYY-MM-DD (UTC)', () => {
      expect(bucketLabel(new Date(Date.UTC(2026, 7, 18)))).toBe('2026-08-18');
    });

    it('laisse passer une chaîne déjà formatée', () => {
      expect(bucketLabel('2026-08-18')).toBe('2026-08-18');
    });
  });

  describe('parisStart / parisEndExclusive', () => {
    it('parisStart contient AT TIME ZONE Europe/Paris', () => {
      expect(parisStart('2026-01-01').sql).toContain("AT TIME ZONE 'Europe/Paris'");
    });

    it('parisEndExclusive ajoute un jour à la date de fin', () => {
      const frag = parisEndExclusive('2026-01-01');
      expect(frag.sql).toContain("AT TIME ZONE 'Europe/Paris'");
      expect(frag.sql).toContain('+ 1');
    });
  });
});
