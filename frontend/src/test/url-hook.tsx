import type { ReactNode } from 'react';
import { renderHook, type RenderHookResult } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType, type Location, type NavigationType } from 'react-router';

interface UrlHookResult<T> {
  readonly value: T;
  readonly location: Location;
  /** Type de la dernière navigation : REPLACE = pas de nouvelle entrée d'historique. */
  readonly navigationType: NavigationType;
}

/**
 * Rend un hook sous un routeur en mémoire et expose l'adresse courante :
 * les hooks de liste écrivent leurs filtres dans l'adresse, c'est elle que
 * les tests vérifient (lien partageable, retour arrière).
 */
export function renderUrlHook<T>(
  hook: () => T,
  route = '/liste',
): RenderHookResult<UrlHookResult<T>, unknown> {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  }
  return renderHook(
    () => {
      const value = hook();
      const location = useLocation();
      const navigationType = useNavigationType();
      return { value, location, navigationType };
    },
    { wrapper: Wrapper },
  );
}

/** Paramètres de recherche de l'adresse courante. */
export function paramsOf(location: Location): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(location.search));
}
