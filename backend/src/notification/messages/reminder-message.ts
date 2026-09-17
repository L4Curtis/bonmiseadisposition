import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';

/** Libellés du type de document rappelé (miroir de confirmation-messages,
 *  dupliqué volontairement : les deux évoluent indépendamment). */
const TYPE_LABELS: Record<string, string> = {
  mise_disposition: 'mise à disposition',
  restitution: 'restitution',
  pv_cloture: "procès-verbal d'équipements non restitués",
};

export interface ReminderMessageInput {
  reference: string;
  filialeNom: string;
  signerUrl: string;
  reminderNumber: number;
  maxReminders: number;
  /** Type du document en attente (sig.type) — clé de TYPE_LABELS. */
  docType: string;
}

/** Variables + sujet du rappel de signature (bon en attente depuis trop longtemps). */
export function buildReminderMessage(input: ReminderMessageInput): EmailMessage {
  const typeLabel = TYPE_LABELS[input.docType] ?? 'mise à disposition';
  const subjectDoc = input.docType === 'pv_cloture' ? 'Procès-verbal' : `Bon de ${typeLabel}`;

  return {
    vars: {
      TYPE_LABEL: typeLabel,
      REFERENCE: escapeHtml(input.reference),
      SIGNER_URL: input.signerUrl,
      REMINDER_NUMBER: String(input.reminderNumber),
      MAX_REMINDERS: String(input.maxReminders),
      FILIALE_NOM: escapeHtml(input.filialeNom),
    },
    subject: `[RAPPEL] [${input.reference}] ${subjectDoc} à signer — ${input.filialeNom}`,
  };
}
