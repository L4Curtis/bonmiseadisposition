import { NotificationBon } from '../../common/types';
import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body as emailBody,
  footer,
  ctaButton,
  refBadge,
} from '../../templates/email-layout';
import { escapeHtml } from './escape-html';
import { DOCUMENT_LABELS, filialeNomOf, formatParisLongDate } from './message-parts';
import type { SystemNoticeEmail } from './system-notice-emails';
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
 * fait signer au guichet si le compte ne peut plus recevoir de lien).
 */
export function buildLinkRequestAlert(bon: NotificationBon, input: LinkRequestAlertInput, appUrl: string): SystemNoticeEmail {
  const collabName = escapeHtml(bon.collaborateur?.displayName ?? input.requesterEmail);
  const documentLabel = DOCUMENT_LABELS[input.documentType];
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const html = emailWrapper(card(
    brandHeader('Nouveau lien de signature demandé', filialeNom, { text: 'Action requise', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip([
      `Bon <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`,
      `<strong style="color:#1B1A18">${escapeHtml(documentLabel)}</strong>`,
    ]),
    emailBody(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        <strong style="color:#1B1A18">${collabName}</strong> (${escapeHtml(input.requesterEmail)}) a ouvert le lien de signature du
        ${escapeHtml(documentLabel)} ${refBadge(escapeHtml(bon.reference))}, expiré le ${formatParisLongDate(input.expiredAt)},
        et demande un nouveau lien.
      </p>
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Depuis la fiche du bon, renvoyez le document, ou faites-le signer au guichet si le collaborateur ne peut plus recevoir de lien.
      </p>
      ${ctaButton(bonUrl(appUrl, bon.id), 'Ouvrir le bon')}
      `),
    footer(),
  ));
  return {
    html,
    // Sujet en texte brut (pas d'échappement HTML).
    subject: `[NOUVEAU LIEN] [${bon.reference}] ${bon.collaborateur?.displayName ?? input.requesterEmail} demande un nouveau lien`,
  };
}
