import { api, ApiError } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import type { SendSerialConflict } from '../types';

export interface UseSendActionsOptions {
  id: string | undefined;
  reload: () => void;
  setActionLoading: (key: string | null) => void;
  setSendSerialConflicts: (conflicts: SendSerialConflict[] | null) => void;
}

/** Envoi du lien de signature — y compris le rattrapage après avertissement
 *  de numéros de série déjà en circulation sur un autre bon (409
 *  serial_conflicts). */
export function useSendActions({ id, reload, setActionLoading, setSendSerialConflicts }: UseSendActionsOptions) {
  const doSend = async (confirmSerialConflicts = false): Promise<boolean> => {
    setActionLoading('send');
    try {
      await api.post(`/bons/${id}/send`, confirmSerialConflicts ? { confirmSerialConflicts: true } : undefined);
      setSendSerialConflicts(null);
      reload();
      return true;
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; conflicts?: SendSerialConflict[] } | undefined;
        if (body?.code === 'serial_conflicts') {
          setSendSerialConflicts(body.conflicts ?? []);
          return false;
        }
      }
      showActionError(e, "Erreur lors de l'envoi du bon");
      return false;
    } finally { setActionLoading(null); }
  };

  /** Confirme l'envoi malgré des numéros de série déjà en circulation
   *  ailleurs (409 serial_conflicts sur POST /bons/:id/send). */
  const confirmSendDespiteConflicts = () => doSend(true);

  return { doSend, confirmSendDespiteConflicts };
}
