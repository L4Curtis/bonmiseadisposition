import { BadRequestException } from '@nestjs/common';
import {
  buildBuckets,
  fillSeries,
  pickGranularity,
  previousRange,
  resolvePeriod,
} from '../kpi-period';

describe('kpi-period', () => {
  describe('resolvePeriod — défaut', () => {
    it('30 derniers jours (bornes incluses) se terminant sur `today` injecté', () => {
      const period = resolvePeriod({}, '2026-09-16');

      expect(period.to).toBe('2026-09-16');
      expect(period.from).toBe('2026-08-18');
      expect(period.days).toBe(30);
      expect(period.granularity).toBe('day');
    });

    it('la période précédente a la même longueur et se termine la veille de `from`', () => {
      const period = resolvePeriod({}, '2026-09-16');

      expect(period.previous).toEqual({ from: '2026-07-19', to: '2026-08-17' });
    });

    it('respecte les bornes explicites fournies dans la query', () => {
      const period = resolvePeriod({ from: '2026-01-01', to: '2026-01-10' });

      expect(period.from).toBe('2026-01-01');
      expect(period.to).toBe('2026-01-10');
      expect(period.days).toBe(10);
    });
  });

  describe('previousRange', () => {
    it('calcule une période de même longueur se terminant la veille de `from`', () => {
      expect(previousRange({ from: '2026-08-18', to: '2026-09-16' })).toEqual({
        from: '2026-07-19',
        to: '2026-08-17',
      });
    });

    it('fonctionne pour une période d’un seul jour', () => {
      expect(previousRange({ from: '2026-03-10', to: '2026-03-10' })).toEqual({
        from: '2026-03-09',
        to: '2026-03-09',
      });
    });
  });

  describe('pickGranularity', () => {
    it('jour jusqu’à 31 jours inclus', () => {
      expect(pickGranularity(1)).toBe('day');
      expect(pickGranularity(31)).toBe('day');
    });

    it('semaine à partir de 32 jours et jusqu’à 182 jours inclus', () => {
      expect(pickGranularity(32)).toBe('week');
      expect(pickGranularity(182)).toBe('week');
    });

    it('mois au-delà de 182 jours', () => {
      expect(pickGranularity(183)).toBe('month');
    });
  });

  describe('buildBuckets', () => {
    it('granularité jour : un label par jour, bornes incluses', () => {
      const buckets = buildBuckets({ from: '2026-08-18', to: '2026-09-16' }, 'day');

      expect(buckets).toHaveLength(30);
      expect(buckets[0]).toBe('2026-08-18');
      expect(buckets[buckets.length - 1]).toBe('2026-09-16');
    });

    it('granularité semaine : buckets alignés sur le lundi', () => {
      // 2026-08-17 est un lundi ; 2026-08-30 un dimanche (2 semaines - 1 jour).
      const buckets = buildBuckets({ from: '2026-08-17', to: '2026-08-30' }, 'week');

      expect(buckets).toEqual(['2026-08-17', '2026-08-24']);
    });

    it('granularité semaine : le premier bucket est le lundi précédant `from` si besoin', () => {
      // 2026-08-18 est un mardi → le bucket englobant démarre le lundi 2026-08-17.
      const buckets = buildBuckets({ from: '2026-08-18', to: '2026-08-18' }, 'week');

      expect(buckets).toEqual(['2026-08-17']);
    });

    it('granularité mois : buckets alignés sur le 1er', () => {
      const buckets = buildBuckets({ from: '2026-01-05', to: '2026-03-20' }, 'month');

      expect(buckets).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    });
  });

  describe('fillSeries', () => {
    it('complète les buckets absents à zéro, dans l’ordre des buckets', () => {
      const buckets = ['2026-01-01', '2026-01-02', '2026-01-03'];
      const rows = [{ bucket: '2026-01-02', count: 5 }];

      const result = fillSeries(buckets, rows, 'count', 0);

      expect(result).toEqual([
        { bucket: '2026-01-01', count: 0 },
        { bucket: '2026-01-02', count: 5 },
        { bucket: '2026-01-03', count: 0 },
      ]);
    });

    it('renvoie un tableau vide si aucun bucket', () => {
      expect(fillSeries([], [{ bucket: '2026-01-01', count: 1 }], 'count', 0)).toEqual([]);
    });
  });

  describe('erreurs de validation (400, message français)', () => {
    it('rejette from > to', () => {
      expect(() => resolvePeriod({ from: '2026-09-20', to: '2026-09-10' })).toThrow(BadRequestException);
      try {
        resolvePeriod({ from: '2026-09-20', to: '2026-09-10' });
      } catch (err) {
        expect((err as Error).message).toContain('Période invalide');
      }
    });

    it('rejette une date calendaire inexistante (2026-02-30)', () => {
      expect(() => resolvePeriod({ from: '2026-02-30', to: '2026-03-01' })).toThrow(BadRequestException);
      try {
        resolvePeriod({ from: '2026-02-30', to: '2026-03-01' });
      } catch (err) {
        expect((err as Error).message).toContain('Période invalide');
      }
    });

    it('rejette un écart supérieur à 731 jours', () => {
      expect(() => resolvePeriod({ from: '2024-01-01', to: '2026-01-02' })).toThrow(BadRequestException);
    });

    it('accepte un écart de 731 jours (borne)', () => {
      expect(() => resolvePeriod({ from: '2024-01-01', to: '2026-01-01' })).not.toThrow();
    });

    it('rejette un format de date invalide', () => {
      expect(() => resolvePeriod({ from: 'hier', to: '2026-09-16' })).toThrow(BadRequestException);
      try {
        resolvePeriod({ from: 'hier', to: '2026-09-16' });
      } catch (err) {
        expect((err as Error).message).toContain('Période invalide');
      }
    });
  });
});
