import { BON_STATUS_LABELS } from '@/domain/labels';
import type { BonStatus } from '@/types';

/** Statuts composites utilisés par le tableau de bord IT — pas de valeur
 *  BonStatus unique, donc traités à part du select simple ci-dessous. */
export const WAITING_ALL_STATUS = 'sent_mise_dispo,sent_restitution,partially_returned';
export const IN_PROGRESS_EXCLUDE = 'cancelled,archived';
/** Valeur factice du <select> pour le filtre « tous sauf clôturés et
 *  annulés » — piloté par excludeStatus (pas par status), donc distingué par
 *  un préfixe dédié. */
export const IN_PROGRESS_OPTION_VALUE = `__exclude:${IN_PROGRESS_EXCLUDE}`;

/** Statuts proposés un par un, dans l'ordre du cycle de vie. */
const STATUS_ORDER: readonly BonStatus[] = [
  'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested', 'archived', 'cancelled',
];

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: IN_PROGRESS_OPTION_VALUE, label: 'Tous sauf clôturés et annulés' },
  { value: WAITING_ALL_STATUS, label: 'Remise, restitution ou PV à signer' },
  ...STATUS_ORDER.map((status) => ({ value: status, label: BON_STATUS_LABELS[status] })),
];
