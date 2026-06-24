import { describe, it, expect } from 'vitest';
import { cn, formatDate, formatDateLong, formatDateTime, todayLocalISO } from '../utils';

describe('cn', () => {
  it('merges class names and dedupes tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', false && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});

describe('date formatters', () => {
  it('returns an em dash for empty input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateLong(undefined)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });

  it('formats a date as dd/mm/yyyy', () => {
    expect(formatDate('2026-06-24')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('formatDateTime includes hour and minute', () => {
    const s = formatDateTime('2026-06-24T09:30:00');
    expect(s).toMatch(/\d{2}:\d{2}/);
  });
});

describe('todayLocalISO', () => {
  it('returns the local date as YYYY-MM-DD', () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
