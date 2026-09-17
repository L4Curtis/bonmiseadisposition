import { describe, it, expect } from 'vitest';
import { formatDate } from '../formatDate';

describe('formatDate', () => {
  it('formats an ISO date string in long French format', () => {
    expect(formatDate('2026-01-10')).toBe('10 janvier 2026');
  });

  it('returns an em dash for a missing value', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});
