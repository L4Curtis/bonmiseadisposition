import type { BonFormField } from './lib/validation';

/** Élément qui reçoit le focus quand on choisit une erreur dans le
 *  récapitulatif, et préfixe de l'identifiant du message sous le champ. */
export const BON_FIELD_ANCHORS: Readonly<Record<BonFormField, string>> = {
  civilite: 'civilite-mme',
  filiale: 'filiale-select',
  collaborateur: 'collaborateur-search',
  dateMiseDisposition: 'date-mise-disposition',
  dateRestitution: 'date-restitution',
  equipments: 'bon-equipments',
};

/** Identifiant du message d'erreur affiché sous un champ. */
export function fieldErrorId(field: BonFormField): string {
  return `${BON_FIELD_ANCHORS[field]}-error`;
}

/** Attributs d'accessibilité d'un champ, selon qu'il est en erreur ou non. */
export function invalidFieldProps(field: BonFormField, error: string | undefined) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(field) } : {};
}
