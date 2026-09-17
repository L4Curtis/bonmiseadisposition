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
  overdue: number;
}
