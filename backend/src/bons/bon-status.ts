import { BonStatus } from '@prisma/client';

/**
 * Statuts d'un bon : libellés et listes nommées, en un seul endroit.
 *
 * Pour savoir « depuis quels statuts peut-on faire X ? », on lit ce fichier :
 * les services n'écrivent plus de liste de statuts en dur. Les libellés
 * suivent le vocabulaire retenu par le propriétaire (plan de refonte du
 * 24/09/2026). Ils apparaissent dans les exports CSV, les PDF et les
 * indicateurs ; la valeur technique (`archived`, `active`…) ne change pas.
 *
 * Toutes les listes sont figées (`Object.freeze`). Pour un filtre Prisma,
 * passer une copie : `{ status: { in: [...CLOSED_BON_STATUSES] } }`.
 */

/** Liste de statuts, en lecture seule. */
export type BonStatusList = readonly BonStatus[];

function statusList(...statuses: BonStatus[]): BonStatusList {
  return Object.freeze(statuses);
}

/** Tous les statuts, dans l'ordre du cycle de vie (ordre d'affichage). */
export const BON_STATUS_ORDER = statusList(
  'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested', 'archived', 'cancelled',
);

/** Libellé affiché de chaque statut. */
export const BON_STATUS_LABELS: Readonly<Record<BonStatus, string>> = Object.freeze({
  draft: 'Brouillon',
  sent_mise_dispo: 'Remise à signer',
  active: 'En cours',
  sent_restitution: 'Restitution à signer',
  partially_returned: 'Restitution en cours',
  archived: 'Clôturé',
  cancelled: 'Annulé',
  contested: 'Contesté',
});

/** Libellé d'un statut, ou la valeur brute si elle est inconnue (jamais
 *  une propriété héritée comme `constructor`). */
export function bonStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(BON_STATUS_LABELS, status)
    ? BON_STATUS_LABELS[status as BonStatus]
    : status;
}

/** Vrai si `status` (souvent typé comme simple texte) fait partie de `list`. */
export function isBonStatusIn(status: string, list: BonStatusList): boolean {
  return (list as readonly string[]).includes(status);
}

// ─── Grandes familles ────────────────────────────────────────────────────────

/** « Clôturé » et « Annulé » : le bon ne bouge plus. Ses pièces jointes et
 *  ses données personnelles relèvent désormais de la durée de conservation. */
export const CLOSED_BON_STATUSES = statusList('archived', 'cancelled');

/** Tous les autres statuts : le bon est encore en cours de traitement. Un
 *  équipement non restitué d'un tel bon est « en circulation » : son numéro
 *  de série ne peut pas figurer sur un autre bon sans avertissement. */
export const IN_PROGRESS_BON_STATUSES = statusList(
  'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
);

/** « Remise à signer » et « Restitution à signer » : le bon entier attend la
 *  signature du collaborateur. */
export const TO_SIGN_BON_STATUSES = statusList('sent_mise_dispo', 'sent_restitution');

/** Un lien de signature peut attendre le collaborateur : bon « à signer », ou
 *  « Restitution en cours » avec une restitution partielle ou un PV de
 *  non-restitution à signer. Renvoi du lien, rappels, clôture sans signature
 *  et dépôt de pièces jointes par le collaborateur portent sur ces statuts. */
export const SIGNATURE_LINK_BON_STATUSES = statusList('sent_mise_dispo', 'sent_restitution', 'partially_returned');

// ─── Étapes du cycle de vie ──────────────────────────────────────────────────

/** Un bon ne s'annule plus une fois la remise signée. */
export const CANCELLABLE_BON_STATUSES = statusList('draft', 'sent_mise_dispo');

/** Remise signée, restitution pas encore terminée : le matériel est chez le
 *  collaborateur. On peut y déclarer un équipement non restitué. */
export const LOANED_BON_STATUSES = statusList('active', 'sent_restitution', 'partially_returned');

/** Des équipements sont chez le collaborateur sans que leur restitution ait
 *  été demandée : on peut l'engager, et le rappel « restitution prévue »
 *  s'applique. */
export const RESTITUTION_START_BON_STATUSES = statusList('active', 'partially_returned');

/** La restitution est engagée : le prochain document à signer est un bon de
 *  restitution (ou un PV de non-restitution). */
export const RESTITUTION_PHASE_BON_STATUSES = statusList('sent_restitution', 'partially_returned');

/** Statuts qui peuvent porter des équipements déclarés non restitués : l'IT
 *  peut y marquer un équipement comme retrouvé. */
export const FOUND_EQUIPMENT_BON_STATUSES = statusList('partially_returned', 'archived');

/** Plus aucune signature possible (collaborateur ou IT) : bon clôturé,
 *  annulé ou contesté. */
export const NON_SIGNABLE_BON_STATUSES = statusList('archived', 'cancelled', 'contested');

/** Bons absents de « Mes équipements » : un brouillon n'a encore rien été
 *  envoyé au collaborateur, un bon annulé ne le concerne plus. */
export const COLLAB_HIDDEN_BON_STATUSES = statusList('draft', 'cancelled');
