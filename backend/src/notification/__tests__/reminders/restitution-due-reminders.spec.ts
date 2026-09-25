import { useHostTimeZone } from '../../../common/__tests__/helpers/host-time-zone';
import {
  parseNonNegativeInt,
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

describe('getRestitutionWindow', () => {
  useHostTimeZone('UTC');

  it('takes the Paris calendar day between 0 h and 2 h (UTC server)', () => {
    const now = new Date('2026-04-10T22:30:00Z'); // 0 h 30 à Paris le 11 avril
    const { start, end } = getRestitutionWindow(7, now);

    expect(start).toEqual(new Date('2026-04-11T00:00:00.000Z'));
    expect(end).toEqual(new Date('2026-04-18T23:59:59.999Z'));
  });

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
