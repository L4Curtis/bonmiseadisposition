import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

/**
 * Demande d'un nouveau lien quand le sien a expiré (R-058), route du lot 2B
 * (`signature/link-request.ts`) : l'équipe informatique est prévenue par
 * email et renvoie le document ; une seule alerte par bon et par 24 h.
 * Réponse de POST /api/signature/:token/request-new-link (200).
 */
export interface RequestNewLinkResult {
  ok: true;
  /** `requested` : l'équipe vient d'être prévenue ; `already_requested` :
   *  une demande de moins de 24 h existe déjà. */
  status: 'requested' | 'already_requested';
  requestedAt: string;
}

/** Message à afficher au collaborateur après sa demande. */
export function requestNewLinkMessage(result: RequestNewLinkResult): string {
  if (result.status === 'already_requested') {
    return `Votre demande du ${formatDateTime(result.requestedAt)} est déjà entre les mains de l'équipe informatique, qui vous renverra un lien.`;
  }
  return "Votre demande est transmise à l'équipe informatique, qui vous renverra un lien.";
}

export function requestNewLink(token: string): Promise<RequestNewLinkResult> {
  return api.post<RequestNewLinkResult>(`/signature/${encodeURIComponent(token)}/request-new-link`);
}
