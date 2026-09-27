import { describe, it, expect, vi, afterEach } from 'vitest';
import { daysSince, daysOverdue, equipmentOverdueDays } from '../dateMetrics';
import * as dates from '@/lib/dates';

describe('dateMetrics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('daysSince', () => {
    it('retourne 0 quand la date est aujourd’hui', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(daysSince('2026-09-18T08:00:00.000Z')).toBe(0);
    });

    it('retourne un nombre positif pour une date passée', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(daysSince('2026-09-01')).toBe(17);
    });

    it('retourne un nombre négatif pour une date future', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(daysSince('2026-09-25')).toBe(-7);
    });
  });

  describe('daysOverdue', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('retourne null quand il n’y a pas de date de restitution', () => {
      expect(daysOverdue(null)).toBeNull();
    });

    it('retourne null quand la restitution est aujourd’hui ou dans le futur', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(daysOverdue('2026-09-18')).toBeNull();
      expect(daysOverdue('2026-09-19')).toBeNull();
    });

    it('retourne le nombre de jours de retard quand la restitution est passée', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(daysOverdue('2026-09-10')).toBe(8);
    });
  });

  describe('equipmentOverdueDays', () => {
    it('compte le retard d’un équipement du parc', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(equipmentOverdueDays({ situation: 'en_circulation', dateRestitution: '2026-09-10' })).toBe(8);
    });

    it('n’en compte jamais pour un équipement non restitué, qui n’est plus attendu', () => {
      vi.spyOn(dates, 'todayInParis').mockReturnValue('2026-09-18');
      expect(equipmentOverdueDays({ situation: 'non_restitue', dateRestitution: '2026-09-10' })).toBeNull();
    });
  });
});
