import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { buildEquipList, buildNotReturnedList } from './equipment-lists';

export interface EmailMessage {
  vars: Record<string, string>;
  subject: string;
}

function filialeNomOf(bon: NotificationBon): string {
  return bon.filiale?.displayName ?? bon.filiale?.name ?? '';
}

function civiliteLabel(bon: NotificationBon): string {
  return bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
}

/** Variables + sujet de l'email "bon de mise à disposition à signer". */
export function buildMiseDispositionRequestMessage(bon: NotificationBon, signerUrl: string): EmailMessage {
  const filialeNom = filialeNomOf(bon);
  const dateMise = new Date(bon.dateMiseDisposition ?? new Date()).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      DATE_MISE_DISPO: dateMise,
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      EQUIP_LIST: buildEquipList(bon.equipments ?? []),
    },
    subject: `[${bon.reference}] Bon de mise à disposition à signer — ${filialeNom}`,
  };
}

/** Section HTML des équipements restants sur le bon (restitution partielle
 *  uniquement — chaîne vide si la restitution est complète). */
function buildRemainingSection(remainingEquipments: NonNullable<NotificationBon['equipments']>): string {
  if (remainingEquipments.length === 0) return '';
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#A79F94;text-transform:uppercase;letter-spacing:0.08em">Éléments restants sur ce bon (${remainingEquipments.length})</p>
      <div style="background-color:#F6F3EE;border:1px solid #E2DFD9;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none">${buildEquipList(remainingEquipments)}</ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#6B665E;line-height:1.6;background:#F6F3EE;border:1px solid #E2DFD9;border-radius:8px;padding:10px 14px">Ces équipements ne font pas partie de cette restitution et restent attribués.</p>`;
}

/** Variables + sujet de l'email "bon de restitution à signer". */
export function buildRestitutionRequestMessage(bon: NotificationBon, signerUrl: string): EmailMessage {
  const filialeNom = filialeNomOf(bon);

  // Only list equipment being returned (returnedAt set), not all bon equipment
  const returnedEquipments = (bon.equipments ?? []).filter((eq) => eq.returnedAt);
  const remainingEquipments = (bon.equipments ?? []).filter((eq) => !eq.returnedAt && !eq.notReturned);
  const equipList = returnedEquipments.length > 0
    ? buildEquipList(returnedEquipments)
    : buildEquipList(bon.equipments ?? []);

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      EQUIP_LIST: equipList,
      REMAINING_SECTION: buildRemainingSection(remainingEquipments),
    },
    subject: `[${bon.reference}] Bon de restitution à signer — ${filialeNom}`,
  };
}

/** Variables + sujet de l'email "procès-verbal d'équipements non restitués à signer". */
export function buildPvClotureRequestMessage(bon: NotificationBon, signerUrl: string): EmailMessage {
  const filialeNom = filialeNomOf(bon);

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      NOT_RETURNED_LIST: buildNotReturnedList(bon.equipments ?? []),
    },
    subject: `[${bon.reference}] Procès-verbal d'équipements non restitués à signer — ${filialeNom}`,
  };
}
