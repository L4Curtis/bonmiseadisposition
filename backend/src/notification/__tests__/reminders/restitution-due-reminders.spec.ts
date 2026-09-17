import {
  parseNonNegativeInt,
  formatDateInTimeZone,
  getRestitutionWindow,
} from '../../reminders/restitution-due-reminders';

describe('parseNonNegativeInt', () => {
  it('returns the fallback when raw is null', () => {
    expect(parseNonNegativeInt(null, 7)).toBe(7);
  });

  it('accepts 0 as a valid value (unlike parseDelay)', () => {
    expect(parseNonNegativeInt('0', 7)).toBe(0);
  });

  it('parses a positive integer', () => {
    expect(parseNonNegativeInt('14', 7)).toBe(14);
  });

  it('falls back for a negative value', () => {
    expect(parseNonNegativeInt('-1', 7)).toBe(7);
  });

  it('falls back for a non-numeric value', () => {
    expect(parseNonNegativeInt('abc', 7)).toBe(7);
  });
});

describe('formatDateInTimeZone', () => {
  it('formats a date as YYYY-MM-DD in the given time zone', () => {
    // 2026-04-10T23:30:00Z is already 2026-04-11 in Europe/Paris (CEST, UTC+2)
    expect(formatDateInTimeZone(new Date('2026-04-10T23:30:00Z'), 'Europe/Paris')).toBe('2026-04-11');
  });

  it('uses UTC directly when timeZone is UTC', () => {
    expect(formatDateInTimeZone(new Date('2026-04-10T23:30:00Z'), 'UTC')).toBe('2026-04-10');
  });
});

describe('getRestitutionWindow', () => {
  it('returns [today 00:00, today+N 23:59:59.999] in Paris local calendar days', () => {
    const now = new Date('2026-04-10T08:00:00Z'); // 10h Paris (CEST, UTC+2)
    const { start, end } = getRestitutionWindow(7, now);

    expect(start).toEqual(new Date('2026-04-10T00:00:00.000Z'));
    expect(end).toEqual(new Date('2026-04-17T23:59:59.999Z'));
  });

  it('collapses to a single day when beforeDays is 0', () => {
    const now = new Date('2026-04-10T08:00:00Z');
    const { start, end } = getRestitutionWindow(0, now);

    expect(start).toEqual(new Date('2026-04-10T00:00:00.000Z'));
    expect(end).toEqual(new Date('2026-04-10T23:59:59.999Z'));
  });
});
