import { useHostTimeZone } from '../../../common/__tests__/helpers/host-time-zone';
import { getRestitutionWindow } from '../../reminders/restitution-due-reminders';

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
