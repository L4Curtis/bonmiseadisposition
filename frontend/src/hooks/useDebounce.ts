import { useEffect, useState } from 'react';

/** Délai commun de la recherche au fil de la frappe. */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Valeur retardée : suit `value` seulement quand elle n'a plus changé depuis
 * `delayMs`. Sert à la recherche au fil de la frappe (un appel au serveur à la
 * fin de la saisie, pas un par lettre). La minuterie est annulée au démontage :
 * une page quittée n'écrit plus rien.
 *
 * @example
 * const [saisie, setSaisie] = useState(filters.search);
 * const recherche = useDebounce(saisie);
 * useEffect(() => setFilter('search', recherche.trim()), [recherche, setFilter]);
 */
export function useDebounce<T>(value: T, delayMs: number = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
