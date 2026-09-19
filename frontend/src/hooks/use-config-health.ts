import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export type ConfigHealthState = 'configure' | 'incomplet' | 'desactive' | 'non_configure';

export interface ConfigHealthSection {
  key: string;
  label: string;
  state: ConfigHealthState;
  detail: string;
  updatedAt: string | null;
}

interface ConfigHealthStoreState {
  sections: ConfigHealthSection[] | null;
  loading: boolean;
  error: string | null;
}

export interface UseConfigHealthResult {
  sections: ConfigHealthSection[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// État partagé par tous les composants montés (carte de synthèse ConfigHealthCard
// + pastilles AdminSubNav) : un seul module, donc une seule instance de ce store
// pour toute l'application.
let state: ConfigHealthStoreState = { sections: null, loading: true, error: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: ConfigHealthStoreState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ConfigHealthStoreState {
  return state;
}

/** Réservé aux tests : le store est un singleton de module, partagé par tous
 *  les composants montés (c'est tout l'intérêt de la mutualisation) — mais
 *  cela veut aussi dire qu'il survit d'un test à l'autre dans un même fichier
 *  sans ce reset explicite en `beforeEach`. */
export function resetConfigHealthForTests(): void {
  state = { sections: null, loading: true, error: null };
  inFlight = null;
}

/** Déclenche un chargement de `/admin/config/health`, partagé par tous les
 *  composants montés : un appel déjà en vol est réutilisé plutôt que dupliqué
 *  (évite le doublon carte + menu au premier affichage de la page Général). */
function fetchConfigHealth(): Promise<void> {
  if (inFlight) return inFlight;

  setState({ ...state, loading: true, error: null });
  inFlight = api
    .get<{ sections: ConfigHealthSection[] }>('/admin/config/health')
    .then((data) => {
      setState({ sections: data.sections, loading: false, error: null });
    })
    .catch((e: unknown) => {
      setState({
        sections: state.sections,
        loading: false,
        error: errorMessage(e, "Erreur lors du chargement de l'état de la configuration"),
      });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** À appeler après l'enregistrement réussi d'une rubrique de configuration
 *  (ConfigSection) : redemande l'état en arrière-plan sans souscrire au
 *  résultat, pour que la carte de synthèse et les pastilles du menu déjà
 *  montées reflètent le nouvel état sans attendre un remontage. */
export function refreshConfigHealth(): void {
  fetchConfigHealth().catch(() => {});
}

/**
 * État de santé de la configuration (`/admin/config/health`), partagé entre la
 * carte de synthèse (ConfigHealthCard) et les pastilles du menu latéral
 * (AdminSubNav) : les deux composants peuvent être montés en même temps sur la
 * page « Général » sans déclencher deux requêtes identiques.
 *
 * Chaque montage relance un chargement (l'état a pu changer depuis un
 * enregistrement effectué sur une autre page de configuration) — comme le
 * faisait déjà ConfigHealthCard avant sa mutualisation. `reload` permet un
 * rechargement explicite (bouton Réessayer) ; comme le chargement est partagé,
 * un reload déclenché par un composant met aussi à jour tous les autres.
 *
 * `enabled = false` désactive l'appel (ex. sous-navigation « Modèles », qui
 * n'affiche pas de pastille d'état).
 */
export function useConfigHealth(enabled = true): UseConfigHealthResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!enabled) return;
    fetchConfigHealth().catch(() => {
      // Erreur déjà reportée dans le store (state.error) — rien à faire ici.
    });
  }, [enabled]);

  const reload = useCallback(() => {
    fetchConfigHealth().catch(() => {});
  }, []);

  if (!enabled) {
    return { sections: null, loading: false, error: null, reload };
  }

  return { sections: snapshot.sections, loading: snapshot.loading, error: snapshot.error, reload };
}
