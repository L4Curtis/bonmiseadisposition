import { useCallback, useSyncExternalStore } from 'react';

/** Téléphone : moins de 768 px de large (point de rupture `md` de Tailwind). */
export const MOBILE_QUERY = '(max-width: 767px)';

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Vrai tant que la requête média est satisfaite ; suit la rotation de
 * l'écran et le redimensionnement. Sans `matchMedia` (très vieux navigateur,
 * tests), vaut `false` : l'affichage de bureau.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (!hasMatchMedia()) return () => {};
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(() => hasMatchMedia() && window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Affichage téléphone (moins de 768 px) : les listes passent en cartes. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
