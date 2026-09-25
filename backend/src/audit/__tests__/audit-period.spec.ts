import { BadRequestException } from '@nestjs/common';
import { resolveAuditPeriod } from '../audit-period';

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
