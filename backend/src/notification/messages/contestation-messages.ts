import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';
import { ctaButton, refBadge } from '../../templates/email-layout';
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
  // Le bon corrigé n'est encore qu'un brouillon : l'IT le vérifie, puis l'envoie.
  const corrected = replacement
    ? `Le bon corrigé ${refBadge(escapeHtml(replacement.reference))} va vous être envoyé`
    : 'Un bon corrigé va vous être envoyé';
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

/** Ce que le bon attend encore du collaborateur, pour une réponse « Non retenue ». */
export interface RejectionContext {
  /** Lien du document encore en attente, ou `null`. Encore valable, il
   *  permet de signer ; expiré (`linkExpired`), il ouvre la page qui permet
   *  d'en demander un nouveau. */
  signUrl: string | null;
  /** Document en attente de signature, ou `null`. */
  documentType: ReopenedDocument | 'mise_disposition' | null;
  /** Le lien du document en attente a expiré (pendant la contestation). */
  linkExpired?: boolean;
  /** Le collaborateur a déjà signé un document de ce bon. */
  signed: boolean;
}

const PENDING_DOCUMENT_SENTENCES: Readonly<Record<NonNullable<RejectionContext['documentType']>, string>> = Object.freeze({
  mise_disposition: 'le bon de mise à disposition reste à signer.',
  restitution: 'la restitution reste à signer.',
  pv_cloture: 'le PV de non-restitution reste à signer.',
});

const EXPIRED_LINK_SENTENCE = ' Son lien a expiré : le bouton ci-dessous vous permet d’en demander un nouveau.';

/** Suite de « elle n'est pas retenue : … » — jamais « tel qu'il a été
 *  signé » pour un document que le collaborateur n'a pas signé. */
export function rejectionSentence(context: RejectionContext | null | undefined): string {
  if (context?.signUrl && context.documentType) {
    return PENDING_DOCUMENT_SENTENCES[context.documentType] + (context.linkExpired ? EXPIRED_LINK_SENTENCE : '');
  }
  return context?.signed === false ? 'le bon reste valable tel qu’il a été établi.' : 'le bon reste valable tel qu’il a été signé.';
}

/** Bouton du document en attente : signer, ou demander un nouveau lien. */
function signButton(context: RejectionContext | null | undefined): string {
  if (!context?.signUrl || !context.documentType) return '';
  return ctaButton(escapeHtml(context.signUrl), context.linkExpired ? 'Demander un nouveau lien' : 'Signer le document');
}

/** Variables + templateId + sujet de la réponse à une contestation :
 *  « Fondée » (`resolved`) ou « Non retenue » (`rejected`). Pour une
 *  contestation Fondée, `REPLACEMENT_SENTENCE` dit ce qui va se passer : bon
 *  remplaçant pour une remise, correction du bon d'origine
 *  (`reopenedDocument`) pour une restitution ou un PV. Pour une contestation
 *  Non retenue, `REJECTION_SENTENCE` dit ce qui reste valable et
 *  `SIGN_BUTTON` porte le lien du document encore à signer (`rejection`). */
export function buildContestationResolutionMessage(
  bon: NotificationBon,
  action: ContestationResolutionAction,
  resolutionMessage?: string,
  replacement?: { reference: string } | null,
  reopenedDocument?: ReopenedDocument | null,
  rejection?: RejectionContext | null,
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
      REJECTION_SENTENCE: rejectionSentence(rejection),
      SIGN_BUTTON: signButton(rejection),
    },
    subject: `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
  };
}
