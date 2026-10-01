import { useEffect, useState } from 'react';
import type { BonHistoryEntry } from '@/contracts/bons';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export interface BonHistoryState {
  readonly entries: readonly BonHistoryEntry[];
  /** Plus d'actions que le serveur n'en renvoie : les plus anciennes manquent. */
  readonly truncated: boolean;
  /** Nombre total d'actions du bon (plus grand que `entries` si coupé). */
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL: BonHistoryState = { entries: [], truncated: false, total: 0, loading: true, error: null };

/**
 * Historique des actions d'un bon (GET /bons/:id/history, IT seulement), du
 * plus ancien au plus récent. `refreshKey` (date de dernière modification du
 * bon) relance la lecture après une action, pour que la nouvelle ligne
 * apparaisse sans recharger la page.
 */
export function useBonHistory(bonId: string, refreshKey: string): BonHistoryState {
  const [state, setState] = useState<BonHistoryState>(INITIAL);

  useEffect(() => {
    // Ignore une réponse arrivée après un changement de bon ou une action.
    let ignore = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .getList<BonHistoryEntry>(`/bons/${bonId}/history`)
      .then((list) => {
        if (!ignore) setState({ entries: list.items, truncated: list.truncated, total: list.total, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!ignore) setState({ ...INITIAL, loading: false, error: errorMessage(e, 'Historique indisponible pour le moment.') });
      });
    return () => {
      ignore = true;
    };
  }, [bonId, refreshKey]);

  return state;
}
