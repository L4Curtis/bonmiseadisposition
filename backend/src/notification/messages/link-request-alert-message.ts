import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { DOCUMENT_LABELS, filialeNomOf, formatParisLongDate } from './message-parts';
import type { TemplatedEmail } from './system-notice-emails';
import { bonUrl } from '../app-links';

export interface LinkRequestAlertInput {
  documentType: keyof typeof DOCUMENT_LABELS;
  requesterEmail: string;
  expiredAt: Date;
}

/**
 * Alerte « nouveau lien demandé » (R-058), envoyée à l'équipe informatique :
 * un collaborateur a ouvert un lien expiré et demande à signer. Le bouton
 * mène directement à la fiche du bon, d'où l'IT renvoie le document (ou le
 * fait signer au guichet si le compte ne peut plus recevoir de lien). Modèle
 * personnalisable `link_request_alert` : cette fonction n'en construit que
 * les variables et le sujet.
 */
export function buildLinkRequestAlert(bon: NotificationBon, input: LinkRequestAlertInput, appUrl: string): TemplatedEmail {
  return {
    templateId: 'link_request_alert',
    vars: {
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? input.requesterEmail),
      REQUESTER_EMAIL: escapeHtml(input.requesterEmail),
      DOCUMENT_LABEL: escapeHtml(DOCUMENT_LABELS[input.documentType]),
      REFERENCE: escapeHtml(bon.reference),
      FILIALE_NOM: escapeHtml(filialeNomOf(bon)),
      EXPIRED_AT: formatParisLongDate(input.expiredAt),
      BON_URL: bonUrl(appUrl, bon.id),
    },
    // Sujet en texte brut (pas d'échappement HTML).
    subject: `[NOUVEAU LIEN] [${bon.reference}] ${bon.collaborateur?.displayName ?? input.requesterEmail} demande un nouveau lien`,
  };
}
