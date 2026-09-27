import { api } from '@/lib/api';
import type {
  BonDetail,
  InitiateInPersonResponse,
  LinkSignatureType,
  ResendLinkResponse,
  SendChecksResponse,
} from '@/contracts';

/** Confirmations de l'IT pour une remise malgré les contrôles de numéros. */
export interface SendConfirmations {
  readonly confirmSerialConflicts?: boolean;
  readonly confirmMissingSerials?: boolean;
}

/** Appels du cycle de vie d'un bon (fiche). Chaque action renvoie la fiche à jour. */
export const bonApi = {
  detail: (id: string) => api.get<BonDetail>(`/bons/${id}`),
  sendChecks: (id: string) => api.get<SendChecksResponse>(`/bons/${id}/send-check`),
  send: (id: string, confirmations: SendConfirmations) => api.post<BonDetail>(`/bons/${id}/send`, confirmations),
  inPerson: (id: string, type: LinkSignatureType, confirmations: SendConfirmations = {}) =>
    api.post<InitiateInPersonResponse>(`/bons/${id}/initiate-inperson`, { type, ...confirmations }),
  resend: (id: string, force: boolean) => api.post<ResendLinkResponse>(`/bons/${id}/resend`, force ? { force: true } : {}),
  markReturned: (id: string, equipmentIds: readonly string[], inPerson: boolean) =>
    api.post<BonDetail>(`/bons/${id}/initiate-restitution`, { returnedEquipmentIds: equipmentIds, inPerson }),
  undoReturn: (id: string, equipmentIds: readonly string[]) =>
    api.post<BonDetail>(`/bons/${id}/undo-return`, { equipmentIds }),
  declareNotReturned: (id: string, equipmentIds: readonly string[], reason: string, signatureDataUrl: string) =>
    api.post<BonDetail>(`/bons/${id}/declare-not-returned`, { equipmentIds, reason, signatureDataUrl }),
  markFound: (id: string, equipmentIds: readonly string[], signatureDataUrl?: string) =>
    api.post<BonDetail>(`/bons/${id}/mark-found`, { equipmentIds, signatureDataUrl }),
  cancel: (id: string, reason: string) => api.post<BonDetail>(`/bons/${id}/cancel`, reason ? { reason } : {}),
  handoverWithoutSignature: (id: string, reason: string) =>
    api.post<BonDetail>(`/bons/${id}/handover-without-signature`, { reason }),
  closeWithoutSignature: (id: string, reason: string) =>
    api.post<BonDetail>(`/bons/${id}/close-without-signature`, { reason }),
};
