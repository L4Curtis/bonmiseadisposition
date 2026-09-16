import { describe, it, expect } from 'vitest';
import { computeDelta, formatDays, formatHours, formatNumber, formatPercent } from '../kpi-format';

describe('formatNumber', () => {
  it('returns « — » for null/undefined', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formats a plain integer', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
  });

  it('groups thousands (fr-FR)', () => {
    expect(formatNumber(1234)).toMatch(/^1.234$/);
  });
});

describe('formatPercent', () => {
  it('returns « — » for null/undefined', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('formats a ratio as a rounded percentage', () => {
    expect(formatPercent(0.5)).toBe('50 %');
    expect(formatPercent(0)).toBe('0 %');
  });

  it('keeps one decimal when needed', () => {
    expect(formatPercent(0.128)).toBe('12,8 %');
  });
});

describe('formatDays', () => {
  it('returns « — » for null/undefined', () => {
    expect(formatDays(null)).toBe('—');
  });

  it('formats whole and fractional days', () => {
    expect(formatDays(8)).toBe('8 j');
    expect(formatDays(12.4)).toBe('12,4 j');
  });
});

describe('formatHours', () => {
  it('returns « — » for null/undefined', () => {
    expect(formatHours(null)).toBe('—');
  });

  it('displays hours below 48h', () => {
    expect(formatHours(20)).toBe('20 h');
    expect(formatHours(47.9)).toBe('47,9 h');
  });

  it('switches to days at 48h and beyond', () => {
    expect(formatHours(48)).toBe('2 j');
    expect(formatHours(96)).toBe('4 j');
  });
});

describe('computeDelta', () => {
  it('computes a positive variation as "up"', () => {
    expect(computeDelta(112, 100)).toEqual({ pct: 12, direction: 'up' });
  });

  it('computes a negative variation as "down"', () => {
    expect(computeDelta(90, 100)).toEqual({ pct: -10, direction: 'down' });
  });

  it('treats an unchanged value as "flat"', () => {
    expect(computeDelta(100, 100)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('is not calculable when previous is null', () => {
    expect(computeDelta(5, null)).toEqual({ pct: null, direction: 'flat' });
  });

  it('is not calculable when previous is zero (division by zero)', () => {
    expect(computeDelta(5, 0)).toEqual({ pct: null, direction: 'flat' });
  });

  it('is not calculable when current is null/undefined', () => {
    expect(computeDelta(null, 10)).toEqual({ pct: null, direction: 'flat' });
    expect(computeDelta(undefined, 10)).toEqual({ pct: null, direction: 'flat' });
  });
});
