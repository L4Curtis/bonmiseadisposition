import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast, toast } from '../use-toast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not auto-dismiss a destructive (error) toast', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = toast({ title: 'Erreur', variant: 'destructive' }).id;
    });
    expect(result.current.toasts.find((t) => t.id === id)?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.toasts.find((t) => t.id === id)?.open).toBe(true);
  });

  it('auto-dismisses (closes) a normal toast after 3 seconds', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = toast({ title: 'Information' }).id;
    });
    expect(result.current.toasts.find((t) => t.id === id)?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(result.current.toasts.find((t) => t.id === id)?.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts.find((t) => t.id === id)?.open).toBe(false);
  });

  it('keeps at most 3 toasts at a time (TOAST_LIMIT)', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: 'un' });
      toast({ title: 'deux' });
      toast({ title: 'trois' });
      toast({ title: 'quatre' });
    });

    expect(result.current.toasts.length).toBe(3);
    expect(result.current.toasts.some((t) => t.title === 'quatre')).toBe(true);
    expect(result.current.toasts.some((t) => t.title === 'un')).toBe(false);
  });
});
