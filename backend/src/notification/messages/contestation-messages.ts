import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';

/** Variables + sujet de l'alerte de contestation envoyée au staff IT. */
export function buildContestationAlertMessage(
  bon: NotificationBon,
  contestingUser: { displayName?: string; email?: string },
  message: string,
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
    },
    // Subjects are plain text — no HTML escaping (entities would show verbatim)
    subject: `[CONTESTATION] [${reference}] ${userName} conteste son bon — ${filialeNom}`,
  };
}

export type ContestationResolutionAction = 'resolved' | 'rejected';

export interface ContestationResolutionMessage extends EmailMessage {
  templateId: string;
}

/** Variables + templateId + sujet de la réponse à une contestation
 *  (résolue ou rejetée). */
export function buildContestationResolutionMessage(
  bon: NotificationBon,
  action: ContestationResolutionAction,
  resolutionMessage?: string,
): ContestationResolutionMessage {
  const filialeNom = bon.filiale?.displayName ?? '';

  return {
    templateId: action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected',
    vars: {
      REFERENCE: escapeHtml(bon.reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      RESOLUTION_MESSAGE: resolutionMessage ? escapeHtml(resolutionMessage) : '',
    },
    subject: `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
  };
}
