import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';

export type ConfirmationType = 'mise_disposition' | 'restitution' | 'pv_cloture';

export interface ConfirmationMessage {
  templateId: string;
  vars: Record<string, string>;
  subject: string;
}

const TEMPLATE_ID_BY_TYPE: Record<ConfirmationType, string> = {
  mise_disposition: 'confirmation_mise_disposition',
  restitution: 'confirmation_restitution',
  pv_cloture: 'confirmation_pv_cloture',
};

const TYPE_LABEL_BY_TYPE: Record<ConfirmationType, string> = {
  mise_disposition: 'mise à disposition',
  restitution: 'restitution',
  pv_cloture: "procès-verbal d'équipements non restitués",
};

/** Variables + templateId + sujet de l'email de confirmation de signature
 *  (mise à disposition / restitution / procès-verbal de clôture). */
export function buildConfirmationMessage(bon: NotificationBon, type: ConfirmationType): ConfirmationMessage {
  const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

  return {
    templateId: TEMPLATE_ID_BY_TYPE[type],
    vars: {
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      TYPE_LABEL: TYPE_LABEL_BY_TYPE[type],
    },
    subject: `[${bon.reference}] Confirmation de signature — ${filialeNom}`,
  };
}
