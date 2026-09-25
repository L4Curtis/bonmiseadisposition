import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  EMPTY_DATE,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatTime,
  todayInParis,
} from '../dates';

// Les instants sont donnés en UTC : les attendus prouvent que l'affichage se
// fait à l'heure de Paris quel que soit le fuseau de la machine (poste Windows
// à Paris, CI Linux en UTC, navigateur d'un collaborateur en déplacement).

describe('formatDate — JJ/MM/AAAA', () => {
  it('formate une date seule', () => {
    expect(formatDate('2026-09-03')).toBe('03/09/2026');
  });

  it('prend le jour à Paris : 22 h 30 UTC le 3 = 00 h 30 le 4 à Paris (été)', () => {
    expect(formatDate('2026-09-03T22:30:00.000Z')).toBe('04/09/2026');
  });

  it('accepte un objet Date', () => {
    expect(formatDate(new Date('2026-01-15T10:00:00Z'))).toBe('15/01/2026');
  });
});

describe('formatDateTime — JJ/MM/AAAA HH:MM', () => {
  it('heure d’été (UTC+2)', () => {
    expect(formatDateTime('2026-09-03T12:22:00.000Z')).toBe('03/09/2026 14:22');
  });

  it('heure d’hiver (UTC+1)', () => {
    expect(formatDateTime('2026-01-15T08:05:00.000Z')).toBe('15/01/2026 09:05');
  });
});

describe('formatDateLong — date en toutes lettres (en-têtes)', () => {
  it('écrit le jour sans zéro initial et le mois en lettres', () => {
    expect(formatDateLong('2026-09-03')).toBe('3 septembre 2026');
  });

  it('prend aussi le jour à Paris', () => {
    expect(formatDateLong('2026-12-31T23:30:00.000Z')).toBe('1 janvier 2027');
  });
});

describe('formatTime — HH:MM', () => {
  it('donne l’heure de Paris', () => {
    expect(formatTime('2026-09-03T12:22:00.000Z')).toBe('14:22');
  });

  it('accepte un instant en millisecondes (Date.now())', () => {
    expect(formatTime(Date.UTC(2026, 8, 3, 12, 22))).toBe('14:22');
  });
});

describe('valeurs absentes ou invalides', () => {
  it.each([null, undefined, '', 'pas une date'])('%s → tiret cadratin', (value) => {
    expect(formatDate(value)).toBe(EMPTY_DATE);
    expect(formatDateTime(value)).toBe(EMPTY_DATE);
    expect(formatDateLong(value)).toBe(EMPTY_DATE);
    expect(formatTime(value)).toBe(EMPTY_DATE);
  });

  it('le tiret est « — »', () => {
    expect(EMPTY_DATE).toBe('—');
  });
});

describe('todayInParis — AAAA-MM-JJ', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renvoie la date de Paris, même quand l’UTC est encore la veille', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T22:30:00.000Z'));
    expect(todayInParis()).toBe('2026-09-25');
  });

  it('a toujours la forme AAAA-MM-JJ', () => {
    expect(todayInParis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
