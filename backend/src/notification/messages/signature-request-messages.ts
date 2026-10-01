import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import type { LinkCorrection } from '../../common/link-correction';
import { buildEquipList, buildNotReturnedList } from './equipment-lists';
import { civiliteLongOf, filialeNomOf, formatParisLongDate } from './message-parts';
import { buildAlreadyReturnedSection, buildRemainingSection, pendingRestitutionGroups } from './restitution-sections';
import { buildCorrectionNotice, correctedSubjectLabel } from './correction-notice';

export interface EmailMessage {
  vars: Record<string, string>;
  subject: string;
}

/** Options d'une demande de signature : le document suit-il une correction
 *  (contestation Fondée, marquage corrigé, bon modifié) ? */
export interface RequestMessageOptions {
  correction?: LinkCorrection | null;
}

function civiliteLabel(bon: NotificationBon): string {
  return civiliteLongOf(bon);
}

/** Variables + sujet de l'email "bon de mise à disposition à signer". */
export function buildMiseDispositionRequestMessage(
  bon: NotificationBon,
  signerUrl: string,
  options: RequestMessageOptions = {},
): EmailMessage {
  const correction = options.correction ?? null;
  const filialeNom = filialeNomOf(bon);
  const dateMise = formatParisLongDate(bon.dateMiseDisposition ?? new Date());

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      DATE_MISE_DISPO: dateMise,
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      EQUIP_LIST: buildEquipList(bon.equipments ?? []),
      CORRECTION_NOTICE: buildCorrectionNotice(correction, 'mise_disposition'),
    },
    subject: `[${bon.reference}] ${correctedSubjectLabel(correction, 'mise_disposition')} — ${filialeNom}`,
  };
}

/**
 * Variables + sujet de l'email « bon de restitution à signer ». Comme le PDF :
 * « Équipements restitués » ne liste que ce qui est rendu dans CETTE
 * restitution ; ce qui l'avait été avant et ce qui reste chez le
 * collaborateur viennent à part.
 */
export function buildRestitutionRequestMessage(
  bon: NotificationBon,
  signerUrl: string,
  options: RequestMessageOptions = {},
): EmailMessage {
  const filialeNom = filialeNomOf(bon);
  const correction = options.correction ?? null;
  const groups = pendingRestitutionGroups(bon);
  // Rien de marqué rendu (aperçu d'un bon jamais rendu) : le bon entier.
  const equipList = buildEquipList(groups.returnedNow.length > 0 ? groups.returnedNow : bon.equipments ?? []);

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      EQUIP_LIST: equipList,
      ALREADY_RETURNED_SECTION: buildAlreadyReturnedSection(groups.returnedBefore),
      REMAINING_SECTION: groups.returnedNow.length > 0 ? buildRemainingSection(groups.stillHeld) : '',
      CORRECTION_NOTICE: buildCorrectionNotice(correction, 'restitution'),
    },
    subject: `[${bon.reference}] ${correctedSubjectLabel(correction, 'restitution')} — ${filialeNom}`,
  };
}

/** Variables + sujet de l'email « PV de non-restitution à signer ». */
export function buildPvClotureRequestMessage(
  bon: NotificationBon,
  signerUrl: string,
  options: RequestMessageOptions = {},
): EmailMessage {
  const filialeNom = filialeNomOf(bon);
  const correction = options.correction ?? null;

  return {
    vars: {
      COLLAB_CIVILITE: civiliteLabel(bon),
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: signerUrl,
      NOT_RETURNED_LIST: buildNotReturnedList(bon.equipments ?? []),
      CORRECTION_NOTICE: buildCorrectionNotice(correction, 'pv_cloture'),
    },
    subject: `[${bon.reference}] ${correctedSubjectLabel(correction, 'pv_cloture')} — ${filialeNom}`,
  };
}
