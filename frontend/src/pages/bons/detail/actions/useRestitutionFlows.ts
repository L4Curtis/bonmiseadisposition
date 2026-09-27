import { toast } from '@/hooks/use-toast';
import { showActionError } from '@/lib/errors';
import { bonApi } from '../bon-api';
import type { Channel } from './bon-dialog';
import { requireItSignature, type FlowDeps } from './useLinkFlows';

interface RestitutionLinks {
  readonly resend: (force?: boolean) => Promise<boolean>;
  readonly openInPerson: (type: 'restitution') => Promise<boolean>;
}

/**
 * Parcours de restitution, par email comme au guichet (R-001, R-010) :
 * 1) sélection et marquage des équipements rendus ; 2) signature IT de la
 * restitution, dont le PDF montre ces équipements ; 3) le lien (email, ou QR
 * code au guichet). Fermer la signature IT n'envoie rien.
 */
export function useRestitutionFlows(deps: FlowDeps, links: RestitutionLinks) {
  const { id, bon, reload, setDialog, setActionLoading } = deps;

  const signThenLink = (channel: Channel) => {
    requireItSignature(
      deps,
      'restitution',
      channel === 'email'
        ? 'Les équipements rendus sont enregistrés. Votre signature IT certifie la restitution ; le lien partira ensuite par email.'
        : 'Les équipements rendus sont enregistrés. Votre signature IT certifie la restitution ; le lien s’affichera ensuite pour le collaborateur.',
      channel === 'email' ? () => links.resend(true) : () => links.openInPerson('restitution'),
      'Restitution enregistrée : le lien partira après votre signature IT (bouton de la fiche).',
    );
  };

  /** Fenêtre de sélection confirmée. `selectedIds` : équipements nouvellement
   *  rendus (ceux déjà marqués et non signés restent cochés d'office). */
  const confirmRestitution = async (selectedIds: readonly string[], channel: Channel) => {
    if (!id) return;
    if (selectedIds.length > 0) {
      setActionLoading('restitution');
      try {
        await bonApi.markReturned(id, selectedIds, channel === 'in_person');
      } catch (e: unknown) {
        showActionError(e, 'Erreur lors de l’enregistrement de la restitution');
        return;
      } finally { setActionLoading(null); }
      reload();
    }
    setDialog(null);
    signThenLink(channel);
  };

  const undoReturn = async (equipmentIds: readonly string[]) => {
    if (!id) return;
    setActionLoading('undo');
    try {
      await bonApi.undoReturn(id, equipmentIds);
      toast({
        title: 'Marquage annulé',
        description: 'Les équipements sont de nouveau chez le collaborateur. Le lien de restitution précédent ne vaut plus.',
      });
      setDialog(null);
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de l’annulation du marquage');
    } finally { setActionLoading(null); }
  };

  const declareNotReturned = async (equipmentIds: string[], reason: string, signatureDataUrl: string) => {
    if (!id) return;
    setActionLoading('notreturned');
    try {
      await bonApi.declareNotReturned(id, equipmentIds, reason, signatureDataUrl);
      toast({ title: 'Déclaration enregistrée', description: 'Le PV de non-restitution suivra dès que plus rien n’est en attente.' });
      setDialog(null);
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la déclaration de non-restitution');
    } finally { setActionLoading(null); }
  };

  const markFound = async (equipmentIds: string[], signatureDataUrl?: string) => {
    if (!id) return;
    setActionLoading('markfound');
    try {
      await bonApi.markFound(id, equipmentIds, signatureDataUrl);
      toast({
        title: 'Équipement retrouvé',
        description: bon?.status === 'archived'
          ? 'Un avenant a été ajouté au bon clôturé.'
          : 'Faites maintenant signer la restitution de ces équipements.',
      });
      setDialog(null);
      reload();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de la déclaration d'équipement retrouvé");
    } finally { setActionLoading(null); }
  };

  return { confirmRestitution, signThenLink, undoReturn, declareNotReturned, markFound };
}
