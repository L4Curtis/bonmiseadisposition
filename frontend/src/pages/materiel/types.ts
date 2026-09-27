import { formatDate } from '@/lib/dates';
import type { BonStatus } from '@/types';
import type { EquipmentHolding } from '@/contracts/equipment';

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
  /** Situation sur ce bon, calculée par le serveur (brouillon = rien de remis). */
  holding: EquipmentHolding;
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

export type CurrentHolderKind = 'chez_collaborateur' | 'a_signer' | 'prevu' | 'rendu' | 'non_restitue' | 'aucun';

export interface CurrentHolderStatus {
  kind: CurrentHolderKind;
  label: string;
}

/** Lignes qui disent où est réellement l'équipement : un brouillon (rien de
 *  remis) ou un bon annulé ne le déplacent pas. */
const REAL_HOLDINGS: ReadonlySet<EquipmentHolding> = new Set<EquipmentHolding>([
  'handover_to_sign', 'with_collaborateur', 'returned', 'not_returned', 'closed',
]);

function holdingStatus(entry: MaterielHistoryEntry): CurrentHolderStatus {
  const who = entry.bon.collaborateur.displayName;
  const since = formatDate(entry.bon.dateMiseDisposition);
  switch (entry.holding) {
    case 'with_collaborateur':
      return { kind: 'chez_collaborateur', label: `Chez ${who} depuis le ${since}` };
    case 'handover_to_sign':
      return { kind: 'a_signer', label: `Remis à ${who} (remise à signer)` };
    case 'returned':
      return { kind: 'rendu', label: `Rendu le ${formatDate(entry.returnedAt)} par ${who}` };
    case 'not_returned':
      return { kind: 'non_restitue', label: `Déclaré non restitué par ${who}` };
    case 'planned':
      return { kind: 'prevu', label: `Prévu pour ${who} (brouillon, rien n'a été remis)` };
    default:
      return { kind: 'aucun', label: 'Aucun détenteur connu' };
  }
}

/** État actuel de l'équipement : la ligne la plus récente qui dit où il est
 *  (l'historique est trié du plus récent au plus ancien). Un brouillon ne rend
 *  jamais quelqu'un détenteur : à défaut d'autre ligne, il est « prévu pour ». */
export function currentHolderStatus(entries: readonly MaterielHistoryEntry[]): CurrentHolderStatus {
  const real = entries.find((e) => REAL_HOLDINGS.has(e.holding));
  if (real) return holdingStatus(real);
  const planned = entries.find((e) => e.holding === 'planned');
  return planned ? holdingStatus(planned) : { kind: 'aucun', label: 'Aucun détenteur connu' };
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
