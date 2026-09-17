import { formatDate, formatDateTime, getStatusLabel } from '../../render/layout';

// ─── formatDate / formatDateTime ───────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a date as jj/mm/aaaa in the Europe/Paris timezone', () => {
    expect(formatDate(new Date('2026-03-15T10:00:00Z'))).toBe('15/03/2026');
  });

  it('accepts a date string', () => {
    expect(formatDate('2026-01-01T00:00:00Z')).toBe('01/01/2026');
  });

  it('returns an em dash for a null/falsy date', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes date, time and timezone name', () => {
    const result = formatDateTime(new Date('2026-06-10T09:30:00Z'));
    expect(result).toContain('10/06/2026');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('returns an em dash for a missing timestamp', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});

// ─── getStatusLabel ─────────────────────────────────────────────────────────────

describe('getStatusLabel', () => {
  it('returns the known French label for a status', () => {
    expect(getStatusLabel('active')).toBe('Actif');
    expect(getStatusLabel('archived')).toBe('Archivé');
  });

  it('falls back to the raw status when unknown', () => {
    expect(getStatusLabel('some_future_status')).toBe('some_future_status');
  });
});
