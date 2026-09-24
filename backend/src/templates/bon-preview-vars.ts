import { NotificationBon } from '../common/types';
import { PREVIEW_VARS, TemplateDefinition } from './template-catalog';
import {
  buildMiseDispositionRequestMessage,
  buildRestitutionRequestMessage,
  buildPvClotureRequestMessage,
} from '../notification/messages/signature-request-messages';
import { buildConfirmationMessage } from '../notification/messages/confirmation-messages';
import {
  buildContestationAlertMessage,
  buildContestationResolutionMessage,
} from '../notification/messages/contestation-messages';
import { buildReminderMessage } from '../notification/messages/reminder-message';
import { buildRestitutionDueReminderMessage } from '../notification/messages/restitution-due-reminder-message';

/**
 * Aperçu d'un modèle d'email avec les données d'un vrai bon (lot H3).
 *
 * Les variables sont construites par les MÊMES fonctions que l'envoi réel
 * (notification/messages/*) : l'aperçu montre donc exactement ce que recevrait
 * le destinataire, échappement HTML compris. Une seule différence, voulue :
 * le lien de signature est factice. Un aperçu ne lit jamais le jeton d'une
 * signature en base et n'en crée jamais — il ne doit ni exposer ni fabriquer
 * un lien qui permettrait de signer à la place du collaborateur.
 */

/** Segment de chemin factice mis à la place du jeton de signature. Il ne peut
 *  correspondre à aucun jeton réel (ceux-ci sont hexadécimaux, cf.
 *  common/tokens.ts) : le lien mène à la page « lien invalide ». */
export const FAKE_SIGNATURE_TOKEN = 'APERCU-LIEN-FACTICE';

/** Modèles qui ne portent pas sur un bon (alerte de départs : une liste de
 *  collaborateurs issue de la synchronisation LDAP). */
export const NON_BON_TEMPLATES = ['departure_alert'];

/** Données d'un bon lues pour l'aperçu — jamais de jeton de signature. */
export interface PreviewBon extends NotificationBon {
  /** Signatures sans leur jeton : seul le type du document en attente sert. */
  signatures?: Array<{ type: string; signed: boolean }>;
  /** Contestation la plus récente, s'il y en a une. */
  latestContestation?: {
    message: string;
    resolutionMessage: string | null;
    user: { displayName?: string; email?: string | null } | null;
  } | null;
}

export interface BonPreviewVars {
  vars: Record<string, string>;
  subject: string;
  /** Variables du modèle que le bon ne permet pas de renseigner : elles
   *  gardent leur valeur d'exemple (ex. numéro de rappel, message de
   *  contestation d'un bon jamais contesté). */
  sampleVariables: string[];
}

/** Lien de signature factice, sur la vraie URL publique de l'application. */
export function fakeSignerUrl(appUrl: string): string {
  return `${appUrl}/signer/${FAKE_SIGNATURE_TOKEN}`;
}

/** Type du document dont la signature est en attente (pour le libellé du
 *  rappel) — mise à disposition par défaut. */
function pendingDocType(bon: PreviewBon): string {
  const pending = (bon.signatures ?? []).find((s) => !s.signed);
  return pending?.type ?? 'mise_disposition';
}

interface PartialMessage {
  vars: Record<string, string>;
  subject: string;
}

/** Copie du message sans les variables données (elles garderont leur valeur d'exemple). */
function withoutVars(message: PartialMessage, names: string[]): PartialMessage {
  const vars = Object.fromEntries(Object.entries(message.vars).filter(([k]) => !names.includes(k)));
  return { vars, subject: message.subject };
}

/** Variables réelles d'un modèle portant sur un bon (sans les valeurs
 *  d'exemple de repli). */
function buildRealMessage(templateId: string, bon: PreviewBon, appUrl: string): PartialMessage {
  const signerUrl = fakeSignerUrl(appUrl);
  const contestation = bon.latestContestation ?? null;
  const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

  switch (templateId) {
    case 'mise_disposition_request':
      return buildMiseDispositionRequestMessage(bon, signerUrl);
    case 'restitution_request':
      return buildRestitutionRequestMessage(bon, signerUrl);
    case 'pv_cloture_request':
      return buildPvClotureRequestMessage(bon, signerUrl);
    case 'confirmation_mise_disposition':
      return buildConfirmationMessage(bon, 'mise_disposition');
    case 'confirmation_restitution':
      return buildConfirmationMessage(bon, 'restitution');
    case 'confirmation_pv_cloture':
      return buildConfirmationMessage(bon, 'pv_cloture');
    case 'contestation_alert': {
      if (!contestation) {
        return withoutVars(buildContestationAlertMessage(bon, bon.collaborateur ?? {}, ''), ['CONTESTATION_MESSAGE']);
      }
      return buildContestationAlertMessage(bon, contestation.user ?? {}, contestation.message);
    }
    case 'contestation_resolved':
    case 'contestation_rejected': {
      const action = templateId === 'contestation_resolved' ? 'resolved' : 'rejected';
      const message = buildContestationResolutionMessage(bon, action, contestation?.resolutionMessage ?? undefined);
      return contestation?.resolutionMessage ? message : withoutVars(message, ['RESOLUTION_MESSAGE']);
    }
    case 'reminder': {
      const message = buildReminderMessage({
        reference: bon.reference,
        filialeNom,
        signerUrl,
        reminderNumber: 1,
        maxReminders: 1,
        docType: pendingDocType(bon),
      });
      // Le rang du rappel dépend de l'historique d'envoi, pas du bon : valeurs d'exemple.
      return withoutVars(message, ['REMINDER_NUMBER', 'MAX_REMINDERS']);
    }
    case 'restitution_due_reminder':
      return buildRestitutionDueReminderMessage(bon, appUrl);
    default:
      return { vars: {}, subject: '' };
  }
}

/**
 * Variables d'un modèle rendues avec les données d'un bon. Toute variable du
 * modèle que le bon ne renseigne pas retombe sur sa valeur d'exemple
 * (PREVIEW_VARS) et est signalée dans `sampleVariables`.
 */
export function buildBonPreviewVars(
  template: TemplateDefinition,
  bon: PreviewBon,
  appUrl: string,
): BonPreviewVars {
  const real = buildRealMessage(template.id, bon, appUrl);
  const names = template.variables.map((v) => v.name);
  const sampleVariables = names.filter((n) => !(n in real.vars));
  const samples = Object.fromEntries(sampleVariables.map((n) => [n, PREVIEW_VARS[n] ?? '']));
  return {
    vars: { ...samples, ...real.vars },
    subject: real.subject,
    sampleVariables,
  };
}
