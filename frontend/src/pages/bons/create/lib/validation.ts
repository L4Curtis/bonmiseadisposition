import { bonCreateSchema, validate } from '@/lib/validation';
import type { EquipmentLine } from '../types';

export interface BonFormValues {
  collaborateurId: string;
  filialeId: string;
  civilite: 'mme' | 'mr';
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
  const validEquipments = values.equipments.filter((e) => e.catalogItemId || e.customLabel?.trim());
  const result = validate(bonCreateSchema, {
    collaborateurId: values.collaborateurId,
    filialeId: values.filialeId,
    dateMiseDisposition: values.dateMiseDisposition,
    dateRestitution: values.dateRestitution || undefined,
    civilite: values.civilite,
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
  return { success: true, validEquipments };
}
