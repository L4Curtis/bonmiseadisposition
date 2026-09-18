import type { BonStatus } from '@/types';

export interface InventoryCollaborateur {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
}

export interface InventoryFiliale {
  id: string;
  name: string;
  displayName: string;
}

/** Situation d'un équipement du parc, dérivée du statut de son bon
 *  (backend : common/bon-predicates.ts). Un matériel remis dont le bon attend
 *  encore la signature fait partie du parc, distingué des autres. */
export type EquipmentSituation = 'en_attente_signature' | 'en_circulation' | 'en_litige';

export interface InventorySituationSummary {
  situation: EquipmentSituation;
  label: string;
  count: number;
}

/** Sens de tri de la colonne « Mise à disposition » (ancienneté) — seule
 *  colonne triable exposée dans l'interface pour l'instant, même si l'API
 *  accepte aussi `collaborateur`/`category` (cf. inventory-query.dto.ts). */
export type SortDirection = 'asc' | 'desc';

export interface InventoryItem {
  equipmentId: string;
  label: string;
  category: string;
  categoryLabel?: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  bonId: string;
  bonReference: string;
  bonStatus: BonStatus;
  situation: EquipmentSituation;
  situationLabel: string;
  dateMiseDisposition: string;
  dateRestitution: string | null;
  collaborateur: InventoryCollaborateur;
  filiale: InventoryFiliale;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface InventoryCategorySummary {
  category: string;
  label: string;
  count: number;
}

export interface InventoryFilialeSummary {
  filialeId: string;
  name: string;
  count: number;
}

export interface InventorySummary {
  total: number;
  byCategory: InventoryCategorySummary[];
  byFiliale: InventoryFilialeSummary[];
  bySituation: InventorySituationSummary[];
  overdue: number;
}
