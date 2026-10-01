import type { BonForPdf, PdfSignature } from '../pdf-types';
import {
  groupRestitutionEquipments as groupEquipments,
  RestitutionGroups as Groups,
  RestitutionWindow,
  restitutionWindowUntil,
} from '../../common/restitution-groups';

/**
 * Ce que couvre UN document de restitution dans le PDF : même découpage que la
 * page de signature et les emails (common/restitution-groups.ts) — rendus dans
 * cette restitution, déjà rendus avant, restés chez le collaborateur. Jamais
 * « En attente » parmi les équipements restitués.
 */

type Equipment = BonForPdf['equipments'][number];

export type RestitutionGroups = Groups<Equipment>;
export type { RestitutionWindow };

/** Fenêtre du document, d'après la signature du collaborateur qu'il porte
 *  (`null` : document de signature IT, pas encore signé par le collaborateur). */
export function restitutionWindow(signatures: readonly PdfSignature[], collab: PdfSignature | null): RestitutionWindow {
  return restitutionWindowUntil(signatures, collab?.signedAt);
}

export function groupRestitutionEquipments(equipments: readonly Equipment[], window: RestitutionWindow): RestitutionGroups {
  return groupEquipments(equipments, window);
}
