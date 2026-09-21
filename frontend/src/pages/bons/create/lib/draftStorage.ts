import { newLine } from '../types';
import type { EquipmentLine, UserResult } from '../types';

/** Clé dédiée à la création (jamais utilisée en édition d'un brouillon
 *  existant, qui a déjà son propre enregistrement côté serveur). */
const DRAFT_STORAGE_KEY = 'bon-create-draft:v1';

export interface BonDraftData {
  collaborateur: UserResult | null;
  filialeId: string;
  civilite: 'mme' | 'mr';
  dateMiseDisposition: string;
  dateRestitution: string;
  notes: string;
  equipments: EquipmentLine[];
}

/** Un brouillon sans la moindre saisie utile (juste la date du jour
 *  pré-remplie par défaut) ne mérite ni d'être conservé, ni restauré : ce
 *  serait un bandeau « brouillon restauré » surprenant pour rien. */
export function isMeaningfulDraft(data: BonDraftData): boolean {
  if (data.collaborateur || data.filialeId || data.notes.trim() || data.dateRestitution) return true;
  return data.equipments.some(
    (e) => e.catalogItemId || e.customLabel?.trim() || e.serialNumber?.trim() || e.inventoryNumber?.trim() || e.notes?.trim(),
  );
}

/** Lecture défensive : un brouillon corrompu (quota, ancien format, édition
 *  manuelle du localStorage) ne doit jamais faire planter le formulaire. */
export function readDraft(): BonDraftData | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BonDraftData> | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.equipments)) return null;
    return {
      collaborateur: parsed.collaborateur ?? null,
      filialeId: typeof parsed.filialeId === 'string' ? parsed.filialeId : '',
      civilite: parsed.civilite === 'mme' ? 'mme' : 'mr',
      dateMiseDisposition: typeof parsed.dateMiseDisposition === 'string' ? parsed.dateMiseDisposition : '',
      dateRestitution: typeof parsed.dateRestitution === 'string' ? parsed.dateRestitution : '',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      // Nouveaux `_id` locaux : le compteur qui les génère (voir types.ts)
      // repart de zéro à chaque chargement de page — réutiliser les anciens
      // identifiants du brouillon créerait des collisions avec les toutes
      // prochaines lignes ajoutées dans cette session.
      equipments: parsed.equipments
        .filter((e): e is EquipmentLine => !!e && typeof e === 'object')
        .map(({ _id: _oldId, ...rest }) => newLine(rest)),
    };
  } catch {
    return null;
  }
}

/** N'enregistre rien d'inutile : uniquement les champs du formulaire, jamais
 *  d'état transitoire (soumission en cours, conflits de numéro de série...). */
export function writeDraft(data: BonDraftData): void {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota dépassé ou navigation privée : le brouillon est un confort, pas
    // une garantie — la saisie en cours n'est pas bloquée pour autant.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Idem writeDraft
  }
}
