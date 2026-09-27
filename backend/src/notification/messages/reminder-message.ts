import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';
import { DOCUMENT_LABELS } from './message-parts';

/** Ancienne variable {{TYPE_LABEL}} (« bon de {{TYPE_LABEL}} » dans les
 *  modèles personnalisés) : gardée, au vocabulaire du lexique. */
const TYPE_LABELS: Record<string, string> = {
  mise_disposition: 'mise à disposition',
  restitution: 'restitution',
  pv_cloture: 'PV de non-restitution',
};

export interface ReminderMessageInput {
  reference: string;
  filialeNom: string;
  signerUrl: string;
  reminderNumber: number;
  maxReminders: number;
  /** Type du document en attente (sig.type). */
  docType: string;
}

/** Variables + sujet du rappel de signature d'un document. */
export function buildReminderMessage(input: ReminderMessageInput): EmailMessage {
  const docType = input.docType in DOCUMENT_LABELS ? (input.docType as keyof typeof DOCUMENT_LABELS) : 'mise_disposition';
  const documentLabel = DOCUMENT_LABELS[docType];
  const subjectDoc = documentLabel.charAt(0).toUpperCase() + documentLabel.slice(1);

  return {
    vars: {
      TYPE_LABEL: TYPE_LABELS[docType],
      DOCUMENT_LABEL: documentLabel,
      REFERENCE: escapeHtml(input.reference),
      SIGNER_URL: input.signerUrl,
      REMINDER_NUMBER: String(input.reminderNumber),
      MAX_REMINDERS: String(input.maxReminders),
      FILIALE_NOM: escapeHtml(input.filialeNom),
    },
    subject: `[RAPPEL] [${input.reference}] ${subjectDoc} à signer — ${input.filialeNom}`,
  };
}
