import { BadRequestException } from '@nestjs/common';
import { formatParisDateTime, parisDayStartUtc, resolveAuditPeriod } from '../audit-period';

describe('parisDayStartUtc', () => {
  it('minuit à Paris en été = 22 h UTC la veille', () => {
    expect(parisDayStartUtc('2026-09-24').toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });

  it('minuit à Paris en hiver = 23 h UTC la veille', () => {
    expect(parisDayStartUtc('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it("gère les jours de changement d'heure", () => {
    expect(parisDayStartUtc('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(parisDayStartUtc('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
});

describe('resolveAuditPeriod', () => {
  it('sans borne : aucun filtre', () => {
    expect(resolveAuditPeriod()).toBeUndefined();
  });

  it('inclut le jour de fin en entier (borne exclusive au lendemain minuit)', () => {
    const period = resolveAuditPeriod('2026-09-01', '2026-09-24');
    expect(period?.gte?.toISOString()).toBe('2026-08-31T22:00:00.000Z');
    expect(period?.lt?.toISOString()).toBe('2026-09-24T22:00:00.000Z');
  });

  it('accepte une seule borne', () => {
    expect(resolveAuditPeriod(undefined, '2026-12-31')).toEqual({ lt: new Date('2026-12-31T23:00:00.000Z') });
    expect(resolveAuditPeriod('2026-12-31')).toEqual({ gte: new Date('2026-12-30T23:00:00.000Z') });
  });

  it.each(['2026-02-30', '24/09/2026', 'demain'])('rejette une date invalide (%s)', (value) => {
    expect(() => resolveAuditPeriod(value)).toThrow(BadRequestException);
  });

  it('rejette une période inversée', () => {
    expect(() => resolveAuditPeriod('2026-09-24', '2026-09-01')).toThrow(BadRequestException);
  });
});

describe('formatParisDateTime', () => {
  it("formate à l'heure de Paris", () => {
    expect(formatParisDateTime(new Date('2026-09-24T12:05:09.000Z'))).toBe('2026-09-24 14:05:09');
  });
});
