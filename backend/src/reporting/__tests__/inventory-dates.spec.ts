import { daysSince, parisMidnightUtc } from '../inventory-dates';

describe('inventory-dates', () => {
  describe('parisMidnightUtc', () => {
    it('renvoie minuit UTC du jour civil Europe/Paris', () => {
      // 23h UTC le 17/09 = 01h du matin le 18/09 heure de Paris (été, UTC+2).
      const now = new Date('2026-09-17T23:30:00.000Z');
      expect(parisMidnightUtc(now)).toEqual(new Date('2026-09-18T00:00:00.000Z'));
    });
  });

  describe('daysSince', () => {
    const now = new Date('2026-09-18T10:00:00.000Z');

    it('renvoie 0 pour une date correspondant à aujourd\'hui', () => {
      expect(daysSince(new Date('2026-09-18T00:00:00.000Z'), now)).toBe(0);
    });

    it('renvoie un nombre positif de jours pour une date passée', () => {
      expect(daysSince(new Date('2026-09-01T00:00:00.000Z'), now)).toBe(17);
    });

    it('renvoie un nombre négatif pour une date future', () => {
      expect(daysSince(new Date('2026-09-25T00:00:00.000Z'), now)).toBe(-7);
    });
  });
});
