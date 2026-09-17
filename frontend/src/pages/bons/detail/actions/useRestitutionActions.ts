import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';

export interface UseRestitutionActionsOptions {
  id: string | undefined;
  reload: () => void;
  setActionLoading: (key: string | null) => void;
  setShowRestitutionModal: (show: boolean) => void;
  setShowNotReturnedModal: (show: boolean) => void;
  setShowMarkFoundModal: (show: boolean) => void;
}

/** Actions liées au cycle de restitution : initiation, déclaration de
 *  non-restitution, et rattrapage d'un équipement retrouvé. */
export function useRestitutionActions({
  id,
  reload,
  setActionLoading,
  setShowRestitutionModal,
  setShowNotReturnedModal,
  setShowMarkFoundModal,
}: UseRestitutionActionsOptions) {
  const doRestitution = async (returnedEquipmentIds?: string[]): Promise<boolean> => {
    setActionLoading('restitution');
    try {
      await api.post(`/bons/${id}/initiate-restitution`, { returnedEquipmentIds });
      setShowRestitutionModal(false);
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'initiation de la restitution");
      return false;
    } finally { setActionLoading(null); }
  };

  const doDeclareNotReturned = async (equipmentIds: string[], reason: string, signatureDataUrl: string) => {
    setActionLoading('notreturned');
    try {
      await api.post(`/bons/${id}/declare-not-returned`, { equipmentIds, reason, signatureDataUrl });
      setShowNotReturnedModal(false);
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la déclaration de non-restitution');
    } finally { setActionLoading(null); }
  };

  const doMarkFound = async (equipmentIds: string[], signatureDataUrl: string) => {
    setActionLoading('markfound');
    try {
      await api.post(`/bons/${id}/mark-found`, { equipmentIds, signatureDataUrl });
      setShowMarkFoundModal(false);
      reload();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de la déclaration d'équipement retrouvé");
    } finally { setActionLoading(null); }
  };

  return { doRestitution, doDeclareNotReturned, doMarkFound };
}
