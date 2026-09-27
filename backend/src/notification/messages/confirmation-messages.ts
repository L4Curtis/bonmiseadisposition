import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { buildEquipList } from './equipment-lists';
import { DOCUMENT_LABELS, civiliteLongOf, filialeNomOf } from './message-parts';
import { portalUrl } from '../app-links';

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

/** Ancienne variable {{TYPE_LABEL}} (« bon de {{TYPE_LABEL}} » dans les
 *  modèles personnalisés) : gardée, au vocabulaire du lexique. */
const TYPE_LABEL_BY_TYPE: Record<ConfirmationType, string> = {
  mise_disposition: 'mise à disposition',
  restitution: 'restitution',
  pv_cloture: 'PV de non-restitution',
};

/** Équipements concernés par le document signé : tous pour la remise, ceux
 *  rendus pour une restitution, ceux non restitués pour le PV. */
function documentEquipments(bon: NotificationBon, type: ConfirmationType) {
  const all = bon.equipments ?? [];
  if (type === 'restitution') return all.filter((eq) => eq.returnedAt);
  if (type === 'pv_cloture') return all.filter((eq) => eq.notReturned);
  return all;
}

/**
 * Email de confirmation de signature (R-036) : le document signé, ses
 * équipements, et un lien vers le portail où le collaborateur retrouve ses
 * bons et ses documents (le PDF signé est joint quand sa taille le permet).
 */
export function buildConfirmationMessage(bon: NotificationBon, type: ConfirmationType, appUrl: string): ConfirmationMessage {
  const filialeNom = filialeNomOf(bon);
  return {
    templateId: TEMPLATE_ID_BY_TYPE[type],
    vars: {
      COLLAB_CIVILITE: civiliteLongOf(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      TYPE_LABEL: TYPE_LABEL_BY_TYPE[type],
      DOCUMENT_LABEL: DOCUMENT_LABELS[type],
      EQUIP_LIST: buildEquipList(documentEquipments(bon, type)),
      PORTAIL_URL: portalUrl(appUrl),
    },
    subject: `[${bon.reference}] Signature confirmée — ${DOCUMENT_LABELS[type]}`,
  };
}
