import { describe, it, expect } from 'vitest';
import { PRESETS, detectPreset, presetRange, todayInParis } from '../kpi-period';

const TODAY = '2026-09-16';

describe('presetRange', () => {
  it('7d spans 7 inclusive days ending today', () => {
    expect(presetRange('7d', TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-16' });
  });

  it('30d spans 30 inclusive days ending today', () => {
    expect(presetRange('30d', TODAY)).toEqual({ from: '2026-08-18', to: '2026-09-16' });
  });

  it('90d spans exactly 90 inclusive days', () => {
    const { from, to } = presetRange('90d', TODAY);
    expect(to).toBe(TODAY);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(90);
  });

  it('12m spans exactly 365 inclusive days', () => {
    const { from, to } = presetRange('12m', TODAY);
    expect(to).toBe(TODAY);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(365);
  });

  it('crosses a year boundary correctly', () => {
    expect(presetRange('7d', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
  });
});

describe('detectPreset', () => {
  it('detects a preset when the range matches exactly', () => {
    const range = presetRange('30d', TODAY);
    expect(detectPreset(range, TODAY)).toBe('30d');
  });

  it('returns null when "to" is not today (a past custom range)', () => {
    expect(detectPreset({ from: '2026-01-01', to: '2026-01-10' }, TODAY)).toBeNull();
  });

  it('returns null for a custom range ending today but matching no preset length', () => {
    expect(detectPreset({ from: '2026-09-01', to: TODAY }, TODAY)).toBeNull();
  });

  for (const preset of PRESETS) {
    it(`round-trips ${preset}`, () => {
      const range = presetRange(preset, TODAY);
      expect(detectPreset(range, TODAY)).toBe(preset);
    });
  }
});

describe('todayInParis', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayInParis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
