import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_DEBOUNCE_MS, useDebounce } from '../useDebounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('rend la valeur initiale tout de suite', () => {
    const { result } = renderHook(() => useDebounce('abc'));
    expect(result.current).toBe('abc');
  });

  it('attend la fin de la frappe (300 ms par défaut) avant de suivre', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: '' },
    });
    rerender({ value: 'D' });
    rerender({ value: 'Du' });
    act(() => { vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1); });
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('Du');
    expect(DEFAULT_DEBOUNCE_MS).toBe(300);
  });

  it('chaque frappe relance l’attente', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(150); });
    rerender({ value: 'abc' });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('abc');
  });

  it('ne déclenche rien après démontage (page quittée)', () => {
    const { result, rerender, unmount } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    unmount();
    expect(() => act(() => { vi.advanceTimersByTime(1000); })).not.toThrow();
    expect(result.current).toBe('a');
  });
});
