/**
 * Délai de relance des contestations en jours ouvrés (samedi et dimanche
 * exclus, jours fériés non gérés), compté sur le calendrier de Paris.
 */
import { businessDaysBefore, isParisWeekend } from '../overdue/business-days';

const at = (iso: string) => new Date(iso);

describe('isParisWeekend', () => {
  it('lit le jour de la semaine à Paris, pas en UTC', () => {
    // Vendredi 23 h 30 UTC = samedi 1 h 30 à Paris (heure d'été).
    expect(isParisWeekend(at('2026-09-25T23:30:00Z'))).toBe(true);
    // Dimanche 22 h 30 UTC = lundi 0 h 30 à Paris.
    expect(isParisWeekend(at('2026-09-27T22:30:00Z'))).toBe(false);
    expect(isParisWeekend(at('2026-09-23T10:00:00Z'))).toBe(false);
  });
});

describe('businessDaysBefore', () => {
  it('lundi 9 h : 7 jours ouvrés plus tôt = jeudi de la semaine d’avant d’avant, 9 h', () => {
    // Lundi 28/09 9 h Paris → ven 25, jeu 24, mer 23, mar 22, lun 21, ven 18, jeu 17.
    expect(businessDaysBefore(at('2026-09-28T07:00:00Z'), 7).toISOString()).toBe('2026-09-17T07:00:00.000Z');
  });

  it('mercredi 9 h : les deux jours du week-end sont sautés une fois', () => {
    // Mer 30/09 → mar 29, lun 28, ven 25, jeu 24, mer 23, mar 22, lun 21.
    expect(businessDaysBefore(at('2026-09-30T07:00:00Z'), 7).toISOString()).toBe('2026-09-21T07:00:00.000Z');
  });

  it('garde 9 h à Paris à travers le passage à l’heure d’hiver (25/10/2026)', () => {
    // Mer 28/10 9 h Paris (UTC+1) → 7 jours ouvrés plus tôt : lun 19/10 9 h Paris (UTC+2).
    expect(businessDaysBefore(at('2026-10-28T08:00:00Z'), 7).toISOString()).toBe('2026-10-19T07:00:00.000Z');
  });

  it('0 jour : l’instant lui-même', () => {
    const now = at('2026-09-28T07:00:00Z');
    expect(businessDaysBefore(now, 0).getTime()).toBe(now.getTime());
  });
});
