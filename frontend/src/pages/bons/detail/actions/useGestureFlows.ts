import { toast } from '@/hooks/use-toast';
import { showActionError } from '@/lib/errors';
import { WITHOUT_SIGNATURE_DONE_LABELS } from '@/domain/labels';
import { bonApi } from '../bon-api';
import type { ReasonAction } from './bon-dialog';
import type { FlowDeps } from './useLinkFlows';

/** Ce qu'annonce la fiche après chaque geste motivé. */
const DONE: Readonly<Record<ReasonAction, { title: string; description: string }>> = {
  cancel: { title: 'Bon annulé', description: 'Le motif est tracé ; le collaborateur est prévenu si un lien lui avait été envoyé.' },
  handover_without_signature: {
    title: WITHOUT_SIGNATURE_DONE_LABELS.handover_without_signature,
    description: 'Le bon est « En cours ». Le document porte la mention et votre motif.',
  },
  close_without_signature: {
    title: WITHOUT_SIGNATURE_DONE_LABELS.closed_without_signature,
    description: 'Le bon est « Clôturé ». Le document porte la mention et votre motif.',
  },
};

/** Gestes tracés avec motif : annulation, remise constatée et clôture sans signature. */
export function useGestureFlows({ id, reload, setDialog, setActionLoading }: FlowDeps) {
  const confirmReason = async (action: ReasonAction, reason: string) => {
    if (!id) return;
    setActionLoading(action);
    try {
      if (action === 'cancel') await bonApi.cancel(id, reason);
      else if (action === 'handover_without_signature') await bonApi.handoverWithoutSignature(id, reason);
      else await bonApi.closeWithoutSignature(id, reason);
      toast(DONE[action]);
      setDialog(null);
      reload();
    } catch (e: unknown) {
      showActionError(e, 'L’action n’a pas pu être enregistrée');
    } finally { setActionLoading(null); }
  };

  return { confirmReason };
}
