import { bonCreateSchema, validate } from '@/lib/validation';
import type { EquipmentLine } from '../types';
import { hasDesignation, isNonEmptyLine } from './equipmentLines';

export interface BonFormValues {
  collaborateurId: string;
  filialeId: string;
  civilite: 'mme' | 'mr' | '';
  dateMiseDisposition: string;
  dateRestitution: string;
  equipments: EquipmentLine[];
}

/** Champs du formulaire qui peuvent porter une erreur, dans l'ordre de
 *  l'écran : c'est aussi l'ordre du récapitulatif. */
export const BON_FORM_FIELDS = [
  'civilite', 'filiale', 'collaborateur', 'dateMiseDisposition', 'dateRestitution', 'equipments',
] as const;
export type BonFormField = (typeof BON_FORM_FIELDS)[number];
export type BonFieldErrors = Partial<Record<BonFormField, string>>;

export type BonValidationResult =
  | { success: true; validEquipments: EquipmentLine[] }
  | { success: false; fieldErrors: BonFieldErrors };

const CIVILITE_REQUIRED = 'Choisissez la civilité du collaborateur (Madame ou Monsieur).';

/** Clé d'erreur du schéma → champ du formulaire. */
const SCHEMA_KEY_TO_FIELD: Readonly<Record<string, BonFormField>> = {
  collaborateurId: 'collaborateur',
  filialeId: 'filiale',
  dateMiseDisposition: 'dateMiseDisposition',
  dateRestitution: 'dateRestitution',
  equipments: 'equipments',
};

/** Ligne saisie (numéro, notes) sans article ni libellé : elle serait écartée
 *  en silence et son numéro de série se perdrait. On le dit. */
function orphanLineError(equipments: EquipmentLine[]): string | undefined {
  const orphan = equipments.findIndex((e) => isNonEmptyLine(e) && !hasDesignation(e));
  return orphan === -1
    ? undefined
    : `Ligne ${orphan + 1} : choisissez un article du catalogue ou saisissez un libellé (un numéro est saisi).`;
}

/** Erreurs du schéma, rangées par champ du formulaire. */
function schemaErrors(values: BonFormValues, validEquipments: EquipmentLine[]): BonFieldErrors {
  const result = validate(bonCreateSchema, {
    collaborateurId: values.collaborateurId,
    filialeId: values.filialeId,
    dateMiseDisposition: values.dateMiseDisposition,
    dateRestitution: values.dateRestitution || undefined,
    // Vérifiée à part (message dédié, voir CIVILITE_REQUIRED).
    civilite: values.civilite || 'mr',
    equipments: validEquipments.map((e) => ({
      catalogItemId: e.catalogItemId || undefined,
      customLabel: e.customLabel || undefined,
      serialNumber: e.serialNumber || undefined,
      inventoryNumber: e.inventoryNumber || undefined,
      notes: e.notes || undefined,
    })),
  });
  if (result.success) return {};
  return Object.fromEntries(
    Object.entries(result.errors)
      .filter(([key]) => key in SCHEMA_KEY_TO_FIELD)
      .map(([key, message]) => [SCHEMA_KEY_TO_FIELD[key], message]),
  );
}

/** Valide le formulaire courant contre bonCreateSchema et rend **toutes** les
 *  erreurs à la fois, une par champ, dans l'ordre de l'écran : l'utilisateur
 *  corrige tout d'un coup au lieu de découvrir les erreurs une par une.
 *  Centralisé pour que TOUT chemin d'envoi (soumission normale ou
 *  « créer/enregistrer quand même » après conflit de numéro de série) repasse
 *  par la même validation. */
export function runBonValidation(values: BonFormValues): BonValidationResult {
  const validEquipments = values.equipments.filter(hasDesignation);
  const found: BonFieldErrors = {
    ...schemaErrors(values, validEquipments),
    ...(values.civilite === '' ? { civilite: CIVILITE_REQUIRED } : {}),
  };
  const orphan = orphanLineError(values.equipments);
  const all: BonFieldErrors = orphan ? { ...found, equipments: orphan } : found;
  const fieldErrors: BonFieldErrors = Object.fromEntries(
    BON_FORM_FIELDS.filter((field) => all[field]).map((field) => [field, all[field]]),
  );
  return Object.keys(fieldErrors).length > 0 ? { success: false, fieldErrors } : { success: true, validEquipments };
}
