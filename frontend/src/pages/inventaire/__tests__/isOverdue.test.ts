import { describe, it, expect, vi, afterEach } from 'vitest';
import { isOverdue } from '../isOverdue';
import * as kpiPeriod from '@/lib/kpi-period';

describe('isOverdue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retourne false quand il n’y a pas de date de restitution', () => {
    expect(isOverdue(null)).toBe(false);
  });

  it('retourne true quand la date de restitution est strictement avant aujourd’hui (Paris)', () => {
    vi.spyOn(kpiPeriod, 'todayInParis').mockReturnValue('2026-09-17');
    expect(isOverdue('2026-09-16T00:00:00.000Z')).toBe(true);
  });

  it('retourne false quand la date de restitution est aujourd’hui', () => {
    vi.spyOn(kpiPeriod, 'todayInParis').mockReturnValue('2026-09-17');
    expect(isOverdue('2026-09-17T23:00:00.000Z')).toBe(false);
  });

  it('retourne false quand la date de restitution est dans le futur', () => {
    vi.spyOn(kpiPeriod, 'todayInParis').mockReturnValue('2026-09-17');
    expect(isOverdue('2026-09-18T00:00:00.000Z')).toBe(false);
  });
});
