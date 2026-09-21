import { formatDate } from '@/lib/utils';
import type { BonStatus } from '@/types';

/** Une entrée de l'historique : un bon où ce matériel est apparu (référencé
 *  par son n° de série OU son n° d'inventaire — lot L1, les deux comptent
 *  autant l'un que l'autre). */
export interface MaterielHistoryEntry {
  equipmentId: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  label: string | null;
  returnedAt: string | null;
  notReturned: boolean;
  bon: {
    id: string;
    reference: string;
    status: BonStatus;
    dateMiseDisposition: string;
    dateRestitution?: string | null;
    collaborateur: { displayName: string; email: string };
    filiale: { displayName: string };
  };
}

/** Réponse de GET /equipment/history. Le backend renvoie une ENVELOPPE,
 *  pas un tableau : `truncated` signale que l'historique dépasse la limite
 *  de 200 bons, et `total` donne le compte réel. Lire `items`. */
export interface MaterielHistoryResponse {
  items: MaterielHistoryEntry[];
  truncated: boolean;
  total: number;
}

export type CurrentHolderKind = 'en_circulation' | 'rendu' | 'non_rendu';

export interface CurrentHolderStatus {
  kind: CurrentHolderKind;
  label: string;
}

/** État actuel du matériel, dérivé de l'entrée la plus récente (la première :
 *  l'historique est trié du plus récent au plus ancien côté backend).
 *  `undefined` quand il n'y a aucune entrée (référence inconnue — gérée en
 *  amont par un état vide dédié, pas par cette fonction). */
export function currentHolderStatus(latest: MaterielHistoryEntry): CurrentHolderStatus {
  if (latest.notReturned) {
    return { kind: 'non_rendu', label: 'Déclaré non rendu' };
  }
  if (latest.returnedAt) {
    return { kind: 'rendu', label: `Rendu le ${formatDate(latest.returnedAt)}` };
  }
  return {
    kind: 'en_circulation',
    label: `Chez ${latest.bon.collaborateur.displayName} depuis le ${formatDate(latest.bon.dateMiseDisposition)}`,
  };
}

/** Décode le paramètre d'URL `:reference` — tolérant à un `%` mal encodé
 *  (URIError) plutôt que de faire planter la page : on retombe alors sur la
 *  valeur brute, au pire une référence introuvable plutôt qu'un écran blanc. */
export function decodeReferenceParam(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
