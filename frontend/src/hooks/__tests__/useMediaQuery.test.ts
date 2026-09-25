import { afterEach, describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MOBILE_QUERY, useIsMobile, useMediaQuery } from '../useMediaQuery';

type Listener = (event: { matches: boolean }) => void;

function installMatchMedia(initial: boolean) {
  const listeners: Listener[] = [];
  let matches = initial;
  window.matchMedia = ((query: string) => ({
    get matches() { return matches; },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.push(l),
    removeEventListener: (_: string, l: Listener) => listeners.splice(listeners.indexOf(l), 1),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    change(next: boolean) {
      matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
    listenerCount: () => listeners.length,
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('useMediaQuery', () => {
  it('suit la requête média (rotation, redimensionnement)', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
    act(() => media.change(true));
    expect(result.current).toBe(true);
  });

  it('arrête d’écouter au démontage', () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('sans matchMedia (navigateur ancien, tests) : faux, sans erreur', () => {
    // @ts-expect-error — simulation d'un environnement sans matchMedia
    window.matchMedia = undefined;
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
  });
});

describe('useIsMobile', () => {
  it('téléphone = moins de 768 px de large', () => {
    expect(MOBILE_QUERY).toBe('(max-width: 767px)');
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
