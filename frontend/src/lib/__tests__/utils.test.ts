import { describe, it, expect } from 'vitest';
import { cn, formatDate } from '../utils';
import { formatDate as formatDateFromDates } from '../dates';

describe('cn', () => {
  it('merges class names and dedupes tailwind conflicts', () => {
    const hidden = false;
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', hidden && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});

describe('réexportations de compatibilité', () => {
  it('formatDate de utils est celle de lib/dates (une seule implémentation)', () => {
    expect(formatDate).toBe(formatDateFromDates);
  });
});
