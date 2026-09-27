import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import type { BonActionName } from '@/contracts';
import { useBonLoadState } from './actions/useBonLoadState';
import { usePdfDownloads } from './actions/usePdfDownloads';
import type { BonDialog, Channel } from './actions/bon-dialog';
import { useLinkFlows } from './actions/useLinkFlows';
import { useRestitutionFlows } from './actions/useRestitutionFlows';
import { useGestureFlows } from './actions/useGestureFlows';

export interface UseBonActionsOptions {
  /** Autorise l'appel à GET /bons/:id/pdf-snapshots/missing (réservé IT). */
  isItStaff?: boolean;
}

/** Canal proposé par défaut pour une restitution : email si un lien peut
 *  partir, guichet sinon (compte désactivé, pas d'adresse). */
function defaultChannel(bon: { availableActions?: { action: BonActionName; blockedReason: string | null }[] } | null): Channel {
  const byEmail = bon?.availableActions?.find((a) => a.action === 'start_restitution');
  return byEmail && !byEmail.blockedReason ? 'email' : 'in_person';
}

/**
 * État et actions de la fiche d'un bon. Les actions proposées viennent du
 * serveur (`availableActions`, machine à états) : `run(action)` lance le
 * parcours correspondant — contrôles, signature IT, lien, fenêtres — sans
 * rien recalculer du statut.
 */
export function useBonActions(id: string | undefined, options?: UseBonActionsOptions) {
  const isItStaff = options?.isItStaff ?? false;
  const navigate = useNavigate();
  const loadState = useBonLoadState(id, isItStaff);
  const pdf = usePdfDownloads(id, loadState.bon);
  const [dialog, setDialog] = useState<BonDialog | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const deps = { id, bon: loadState.bon, reload: loadState.reload, setDialog, setActionLoading };
  const links = useLinkFlows(deps);
  const restitution = useRestitutionFlows(deps, links);
  const gestures = useGestureFlows(deps);

  const edit = () => {
    if (loadState.bon?.status === 'sent_mise_dispo') setDialog({ kind: 'edit-sent' });
    else navigate(`/bons/${id}/edit`);
  };

  const run = (action: BonActionName) => {
    switch (action) {
      case 'edit': return edit();
      case 'send': return void links.startHandover('email');
      case 'send_in_person': return void links.startHandover('in_person');
      case 'resend': return links.resendPending();
      case 'show_in_person_link': return links.showInPersonLink();
      case 'start_restitution': return setDialog({ kind: 'restitution', channel: 'email' });
      case 'restitution_in_person': return setDialog({ kind: 'restitution', channel: 'in_person' });
      case 'undo_return': return setDialog({ kind: 'undo-return' });
      case 'declare_not_returned': return setDialog({ kind: 'not-returned' });
      case 'mark_found': return setDialog({ kind: 'mark-found' });
      case 'handover_without_signature':
      case 'close_without_signature':
      case 'cancel':
        return setDialog({ kind: 'reason', action });
    }
  };

  /** Lien profond de l'inventaire (`?action=restitution`) : fenêtre de
   *  restitution sur le canal possible. */
  const setShowRestitutionModal = useCallback(
    (open: boolean) => setDialog(open ? { kind: 'restitution', channel: defaultChannel(loadState.bon) } : null),
    [loadState.bon],
  );

  return {
    ...loadState,
    ...pdf,
    dialog,
    setDialog,
    actionLoading,
    run,
    setShowRestitutionModal,
    proceedHandover: links.proceedHandover,
    resend: links.resend,
    confirmRestitution: restitution.confirmRestitution,
    undoReturn: restitution.undoReturn,
    declareNotReturned: restitution.declareNotReturned,
    markFound: restitution.markFound,
    confirmReason: gestures.confirmReason,
    goToEdit: () => navigate(`/bons/${id}/edit`),
  };
}

export type BonActions = ReturnType<typeof useBonActions>;
