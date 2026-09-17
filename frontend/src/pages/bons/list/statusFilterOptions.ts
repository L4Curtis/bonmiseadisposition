/** Statuts composites utilisés par le tableau de bord IT — pas de valeur
 *  BonStatus unique, donc traités à part du select simple ci-dessous. */
export const WAITING_ALL_STATUS = 'sent_mise_dispo,sent_restitution,partially_returned';
export const IN_PROGRESS_EXCLUDE = 'cancelled,archived';
/** Valeur factice du <select> pour le filtre « En cours » — piloté par
 *  excludeStatus (pas par status), donc distingué par un préfixe dédié. */
export const IN_PROGRESS_OPTION_VALUE = `__exclude:${IN_PROGRESS_EXCLUDE}`;

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: IN_PROGRESS_OPTION_VALUE, label: 'En cours (hors archivés/annulés)' },
  { value: WAITING_ALL_STATUS, label: 'En attente de signature (tous)' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent_mise_dispo', label: 'En attente de signature' },
  { value: 'active', label: 'Actif' },
  { value: 'sent_restitution', label: 'En attente de restitution' },
  { value: 'partially_returned', label: 'Restitution partielle' },
  { value: 'contested', label: 'Contesté' },
  { value: 'archived', label: 'Archivé' },
  { value: 'cancelled', label: 'Annulé' },
];
