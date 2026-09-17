import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { showActionError } from '@/lib/errors';
import type { BonDetailData } from '../types';

export interface UseClosureActionsOptions {
  id: string | undefined;
  reload: () => void;
  setActionLoading: (key: string | null) => void;
  setConfirmCancel: (show: boolean) => void;
  setShowCloseUnilateralModal: (show: boolean) => void;
  setResendConfirmSentAt: (sentAt: string | null) => void;
  setInPersonModal: (modal: { type: 'mise_disposition' | 'restitution'; token: string } | null) => void;
}

/** Actions de clôture/fin de cycle : annulation, clôture unilatérale,
 *  renvoi du lien de signature, et initiation d'une signature présentielle. */
export function useClosureActions({
  id,
  reload,
  setActionLoading,
  setConfirmCancel,
  setShowCloseUnilateralModal,
  setResendConfirmSentAt,
  setInPersonModal,
}: UseClosureActionsOptions) {
  const doCancel = async () => {
    setActionLoading('cancel');
    try {
      await api.delete(`/bons/${id}`);
      reload();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'annulation du bon");
    } finally { setActionLoading(null); setConfirmCancel(false); }
  };

  const doInPerson = async (type: 'mise_disposition' | 'restitution'): Promise<boolean> => {
    setActionLoading('inperson');
    try {
      const res = await api.post<{ bon: BonDetailData; token: string }>(`/bons/${id}/initiate-inperson`, { type });
      setInPersonModal({ type, token: res.token });
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la préparation de la signature en présentiel');
      return false;
    } finally { setActionLoading(null); }
  };

  const doCloseUnilateral = async (reason: string) => {
    setActionLoading('closeunilateral');
    try {
      await api.post(`/bons/${id}/close-unilateral`, { reason });
      setShowCloseUnilateralModal(false);
      toast({ title: 'Bon clôturé', description: 'Le bon a été clôturé sans signature, avec mention sur le document.' });
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la clôture unilatérale');
    } finally { setActionLoading(null); }
  };

  const doResend = async (force = false) => {
    setActionLoading('resend');
    try {
      await api.post(`/bons/${id}/resend`, force ? { force: true } : undefined);
      toast({ title: 'Lien renvoyé', description: 'Le lien de signature a été renvoyé avec succès.' });
      setResendConfirmSentAt(null);
      reload();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; sentAt?: string } | undefined;
        if (body?.code === 'token_recent' && body.sentAt) {
          setResendConfirmSentAt(body.sentAt);
          return;
        }
      }
      showActionError(e, 'Erreur lors du renvoi');
    } finally { setActionLoading(null); }
  };

  return { doCancel, doInPerson, doCloseUnilateral, doResend };
}
