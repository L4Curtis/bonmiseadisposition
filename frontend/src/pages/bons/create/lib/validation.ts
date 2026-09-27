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

export type BonValidationResult =
  | { success: true; validEquipments: EquipmentLine[] }
  | { success: false; error: string };

/** Valide le formulaire courant contre bonCreateSchema. Centralisé pour que
 *  TOUT chemin d'envoi (soumission normale ou « créer/enregistrer quand
 *  même » après conflit de numéro de série) repasse par la même validation —
 *  sans ça, contourner le panneau de conflits contournait aussi la validation. */
export function runBonValidation(values: BonFormValues): BonValidationResult {
  // Une ligne saisie (numéro, notes) sans article ni libellé serait écartée
  // en silence : son numéro de série se perdrait. On le dit.
  const orphan = values.equipments.findIndex((e) => isNonEmptyLine(e) && !hasDesignation(e));
  if (orphan !== -1) {
    return {
      success: false,
      error: `Ligne ${orphan + 1} : choisissez un article du catalogue ou saisissez un libellé (un numéro est saisi).`,
    };
  }
  const validEquipments = values.equipments.filter(hasDesignation);
  const result = validate(bonCreateSchema, {
    collaborateurId: values.collaborateurId,
    filialeId: values.filialeId,
    dateMiseDisposition: values.dateMiseDisposition,
    dateRestitution: values.dateRestitution || undefined,
    // Vérifiée à part, après le reste (message dédié ci-dessous).
    civilite: values.civilite || 'mr',
    equipments: validEquipments.map((e) => ({
      catalogItemId: e.catalogItemId || undefined,
      customLabel: e.customLabel || undefined,
      serialNumber: e.serialNumber || undefined,
      inventoryNumber: e.inventoryNumber || undefined,
      notes: e.notes || undefined,
    })),
  });
  if (!result.success) {
    return { success: false, error: Object.values(result.errors)[0] };
  }
  if (values.civilite === '') {
    return { success: false, error: 'Choisissez la civilité du collaborateur (Madame ou Monsieur).' };
  }
  return { success: true, validEquipments };
}
