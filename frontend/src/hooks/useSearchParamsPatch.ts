import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';

/** Modification de paramètres : une chaîne pose la valeur, `null` retire le paramètre. */
export type SearchParamsPatch = Readonly<Record<string, string | null>>;

/**
 * Dernière adresse écrite, pas encore affichée. Partagée entre tous les hooks
 * de liste d'un même écran : si un geste change un filtre puis la page (deux
 * hooks, deux écritures dans le même tour), la seconde écriture part de la
 * première au lieu de l'écraser. Valable tant que l'adresse n'a pas changé
 * (`key` de la location de départ).
 */
let pending: { readonly fromKey: string; readonly search: string } | null = null;

/**
 * Socle des hooks de liste (`useUrlFilters`, `usePagination`, `useSort`) :
 * lit la partie « ?… » de l'adresse et la modifie par petites touches, sans
 * nouvelle entrée d'historique : « retour » quitte la liste au lieu de rejouer
 * chaque frappe, et l'adresse filtrée reste celle vers laquelle on revient
 * depuis une fiche. Les écrans passent par les hooks de liste, pas par lui.
 *
 * `patch(changes, ifChanged)` : `ifChanged` ne s'applique que si `changes`
 * modifie réellement l'adresse (remettre la page à 1 seulement quand un filtre
 * change vraiment, pas quand une recherche différée réécrit la même valeur).
 *
 * `patch` garde la même identité d'un rendu à l'autre : on peut le mettre dans
 * les dépendances d'un effet sans relancer l'effet à chaque changement d'adresse.
 */
export function useSearchParamsPatch(): {
  /** Partie « ?… » de l'adresse courante (chaîne : comparable, mémoïsable). */
  readonly search: string;
  readonly patch: (changes: SearchParamsPatch, ifChanged?: SearchParamsPatch) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef<Location>(location);

  useLayoutEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Une fois l'adresse changée, l'écriture en attente est dépassée : l'oublier
  // évite qu'un retour arrière vers l'entrée de départ ne la réutilise.
  useEffect(() => {
    if (pending && pending.fromKey !== location.key) pending = null;
  }, [location.key]);

  // Écran quitté : rien de ce qu'il a écrit ne doit servir de base à un autre
  // (la première adresse d'un routeur a toujours la même `key`, « default »).
  useEffect(() => () => {
    pending = null;
  }, []);

  const patch = useCallback((changes: SearchParamsPatch, ifChanged?: SearchParamsPatch) => {
    const current = locationRef.current;
    const base = pending && pending.fromKey === current.key ? pending.search : normalize(current.search);
    const changed = applyPatch(base, changes);
    if (changed === base) return;
    const next = ifChanged ? applyPatch(changed, ifChanged) : changed;
    pending = { fromKey: current.key, search: next };
    navigate(
      { pathname: current.pathname, search: next ? `?${next}` : '', hash: current.hash },
      { replace: true },
    );
  }, [navigate]);

  return { search: location.search, patch };
}

function applyPatch(search: string, changes: SearchParamsPatch): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

function normalize(search: string): string {
  return new URLSearchParams(search).toString();
}
