import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Filiale } from '@/types';

/** Durée de validité du cache : passé ce délai, un nouveau montage redemande
 *  la liste plutôt que de réutiliser une valeur potentiellement obsolète —
 *  filet de sécurité pour les changements qui ne passent pas par
 *  `invalidateActiveFiliales` (import concurrent depuis un autre poste). */
const CACHE_TTL_MS = 60_000;

interface ActiveFilialesState {
  filiales: Filiale[];
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

export interface UseActiveFilialesResult {
  filiales: Filiale[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Cache + requête partagés par tous les appelants (formulaires de création,
// filtres, imports...) : un seul module, donc une seule instance pour toute
// l'application.
let state: ActiveFilialesState = { filiales: [], loading: false, error: null, fetchedAt: null };
let inFlight: Promise<Filiale[]> | null = null;
const listeners = new Set<() => void>();

function setState(next: ActiveFilialesState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ActiveFilialesState {
  return state;
}

function isFresh(): boolean {
  return state.fetchedAt !== null && Date.now() - state.fetchedAt < CACHE_TTL_MS;
}

/**
 * Charge `/filiales/active`, avec un cache mémoire de 60 s partagé par tous
 * les appelants et un appel déjà en vol réutilisé plutôt que dupliqué. Point
 * d'entrée commun au hook `useActiveFiliales` et aux chargements ponctuels
 * hors composant React (ex. `useBonCreateReferenceData`, qui combine ce
 * chargement avec catalogue/packs dans un seul `Promise.all`).
 *
 * `filiales` conserve toujours la dernière valeur connue en cas d'échec :
 * les appelants qui doivent vider leur affichage en cas d'erreur le font
 * eux-mêmes via `error` (cf. `useActiveFiliales`).
 */
export function getActiveFiliales(): Promise<Filiale[]> {
  if (isFresh()) return Promise.resolve(state.filiales);
  if (inFlight) return inFlight;

  setState({ ...state, loading: true, error: null });
  inFlight = api
    .get<Filiale[]>('/filiales/active')
    .then((filiales) => {
      setState({ filiales, loading: false, error: null, fetchedAt: Date.now() });
      return filiales;
    })
    .catch((e: unknown) => {
      setState({
        ...state,
        loading: false,
        error: errorMessage(e, 'Erreur lors du chargement des filiales'),
      });
      throw e;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** À appeler après création, modification, activation/désactivation ou import
 *  d'une filiale (page admin des filiales) : vide le cache et redemande
 *  immédiatement la liste, pour que toute page déjà ouverte qui affiche
 *  `useActiveFiliales()` se mette à jour sans attendre un remontage. */
export function invalidateActiveFiliales(): void {
  setState({ ...state, fetchedAt: null });
  getActiveFiliales().catch(() => {});
}

/** Réservé aux tests : le cache est un singleton de module, partagé par tous
 *  les composants montés — et donc aussi entre les tests d'un même fichier
 *  sans ce reset explicite en `beforeEach`. */
export function resetActiveFilialesForTests(): void {
  state = { filiales: [], loading: false, error: null, fetchedAt: null };
  inFlight = null;
}

/**
 * Liste des filiales actives (`GET /filiales/active`), dédupliquée et mise en
 * cache 60 s entre tous les composants montés (formulaires de création,
 * filtres, imports de bons/inventaire/utilisateurs...) au lieu d'un appel par
 * composant à chaque montage.
 *
 * `filiales` conserve la dernière valeur connue en cas d'échec (comportement
 * "avaler l'erreur" de certains appelants historiques) ; les appelants qui
 * doivent vider leur affichage en cas d'erreur ("vider la liste") le font
 * eux-mêmes à partir de `error`, ex. `error ? [] : filiales`.
 */
export function useActiveFiliales(): UseActiveFilialesResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    getActiveFiliales().catch(() => {
      // Erreur déjà reportée dans le store (state.error) — rien à faire ici.
    });
  }, []);

  const reload = useCallback(() => {
    setState({ ...state, fetchedAt: null });
    getActiveFiliales().catch(() => {});
  }, []);

  return { filiales: snapshot.filiales, loading: snapshot.loading, error: snapshot.error, reload };
}
