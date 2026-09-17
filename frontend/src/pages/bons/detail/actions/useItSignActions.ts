import type { FailedItAction, PendingItAction } from '../types';

export interface UseItSignActionsOptions {
  setPendingItAction: (action: PendingItAction | null) => void;
  failedItAction: FailedItAction | null;
  setFailedItAction: (action: FailedItAction | null) => void;
  setRetryingFailedItAction: (retrying: boolean) => void;
}

/** Déclenchement et rattrapage du cachet IT, commun aux flux d'envoi, de
 *  restitution et de présentiel (voir triggerWithItSign dans BonDetail.tsx). */
export function useItSignActions({
  setPendingItAction,
  failedItAction,
  setFailedItAction,
  setRetryingFailedItAction,
}: UseItSignActionsOptions) {
  /** Ouvre la modale de cachet IT. `onSigned` s'exécute APRÈS l'apposition
   *  du cachet (déjà en base à ce stade) et renvoie `false` en cas d'échec —
   *  l'appelant garde alors trace de l'action à relancer SANS redemander de
   *  signature (voir `failedItAction` / `retryFailedItAction`). */
  const triggerWithItSign = (
    pdfType: 'mise_disposition' | 'restitution',
    description: string,
    onSigned: () => Promise<boolean>,
  ) => {
    setPendingItAction({ pdfType, description, onSigned });
  };

  /** Relance l'action qui suit le cachet IT, sans re-signer. */
  const retryFailedItAction = async () => {
    if (!failedItAction) return;
    setRetryingFailedItAction(true);
    try {
      const ok = await failedItAction.retry();
      if (ok) setFailedItAction(null);
    } finally {
      setRetryingFailedItAction(false);
    }
  };

  return { triggerWithItSign, retryFailedItAction };
}
