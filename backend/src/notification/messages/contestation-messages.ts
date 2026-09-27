import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';
import { refBadge } from '../../templates/email-layout';
import { bonUrl, contestationsUrl } from '../app-links';
import type { ReopenedDocument } from '../../contracts/contestations';

/**
 * Variables + sujet de l'alerte de contestation envoyée à l'équipe
 * informatique, avec un lien direct vers le bon et vers la liste des
 * contestations (R-035). Sans `appUrl` (aperçu d'un modèle), les liens
 * gardent leur valeur d'exemple.
 */
export function buildContestationAlertMessage(
  bon: NotificationBon,
  contestingUser: { displayName?: string; email?: string | null },
  message: string,
  appUrl?: string,
): EmailMessage {
  const filialeNom = bon.filiale?.displayName ?? '';
  const reference = bon.reference ?? '';
  const userName = contestingUser?.displayName ?? contestingUser?.email ?? '';

  return {
    vars: {
      USER_NAME: escapeHtml(userName),
      REFERENCE: escapeHtml(reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      CONTESTATION_MESSAGE: escapeHtml(message),
      ...(appUrl ? { BON_URL: bonUrl(appUrl, bon.id), CONTESTATIONS_URL: contestationsUrl(appUrl) } : {}),
    },
    // Subjects are plain text — no HTML escaping (entities would show verbatim)
    subject: `[CONTESTATION] [${reference}] ${userName} conteste son bon — ${filialeNom}`,
  };
}

export type ContestationResolutionAction = 'resolved' | 'rejected';

/** Phrase qui annonce le bon corrigé d'une contestation Fondée (R-050) ; sans
 *  référence connue, elle l'annonce sans la nommer. */
export function replacementSentence(originalReference: string, replacement?: { reference: string } | null): string {
  const original = refBadge(escapeHtml(originalReference));
  const corrected = replacement ? `Le bon corrigé ${refBadge(escapeHtml(replacement.reference))} vous est envoyé` : 'Un bon corrigé vous est envoyé';
  return `${corrected} pour signature : il remplacera le bon ${original} dès que vous l’aurez signé.`;
}

/** Phrase d'une contestation Fondée sur une restitution ou un PV (décision du
 *  26/09) : aucun nouveau bon, le bon d'origine est corrigé puis le document
 *  est renvoyé à signer. */
export function reopenedSentence(document: ReopenedDocument): string {
  return document === 'pv_cloture'
    ? 'Votre bon va être corrigé, puis le PV de non-restitution vous sera renvoyé à signer.'
    : 'Votre bon va être corrigé, puis la restitution vous sera renvoyée à signer.';
}

export interface ContestationResolutionMessage extends EmailMessage {
  templateId: string;
}

/** Variables + templateId + sujet de la réponse à une contestation :
 *  « Fondée » (`resolved`) ou « Non retenue » (`rejected`). Pour une
 *  contestation Fondée, `REPLACEMENT_SENTENCE` dit ce qui va se passer : bon
 *  remplaçant pour une remise, correction du bon d'origine
 *  (`reopenedDocument`) pour une restitution ou un PV. */
export function buildContestationResolutionMessage(
  bon: NotificationBon,
  action: ContestationResolutionAction,
  resolutionMessage?: string,
  replacement?: { reference: string } | null,
  reopenedDocument?: ReopenedDocument | null,
): ContestationResolutionMessage {
  const filialeNom = bon.filiale?.displayName ?? '';

  return {
    templateId: action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected',
    vars: {
      REFERENCE: escapeHtml(bon.reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      RESOLUTION_MESSAGE: resolutionMessage ? escapeHtml(resolutionMessage) : '',
      REPLACEMENT_SENTENCE: reopenedDocument
        ? reopenedSentence(reopenedDocument)
        : replacementSentence(bon.reference, replacement),
    },
    subject: `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
  };
}
