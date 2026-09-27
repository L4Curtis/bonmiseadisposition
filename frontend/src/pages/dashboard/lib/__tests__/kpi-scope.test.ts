import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ageLabel, asOfLabel, countWithUnit, periodLabel, sinceLabel, UNITS, unitWord } from '../kpi-scope';

describe('kpi-scope', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 23 h 30 UTC le 24/09 : il est déjà le 25/09 à Paris.
    vi.setSystemTime(new Date('2026-09-24T23:30:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('accorde l’unité au nombre', () => {
    expect(unitWord(0, UNITS.bons)).toBe('bon');
    expect(unitWord(1, UNITS.equipments)).toBe('équipement');
    expect(countWithUnit(6, UNITS.equipments)).toBe('6 équipements');
  });

  it('dit la portée : état du jour ou période, à l’heure de Paris', () => {
    expect(asOfLabel('2026-09-24T23:30:00.000Z')).toBe('au 25/09');
    expect(periodLabel({ from: '2026-08-27', to: '2026-09-25' })).toBe('du 27/08 au 25/09');
  });

  it('une date à venir est « prévu le », jamais « il y a -3 j »', () => {
    expect(ageLabel('2026-09-28')).toBe('prévu le 28/09');
    expect(ageLabel('2026-09-25')).toBe("aujourd'hui");
    expect(ageLabel('2026-09-13')).toBe('il y a 12 j');
    expect(sinceLabel('2026-09-15T08:00:00.000Z')).toBe('depuis 10 j');
  });
});
