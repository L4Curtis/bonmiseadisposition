export interface UserResult {
  id: string;
  displayName: string;
  /** `null` pour un collaborateur créé manuellement sans adresse email — voir
   *  isDeliverableEmail (@/lib/email), qui accepte déjà cette valeur. */
  email: string | null;
  department?: string | null;
}

export interface CatalogItem {
  id: string;
  brand: string;
  model: string;
  category: string;
  active: boolean;
}

export interface Pack {
  id: string;
  name: string;
  items: { id: string; catalogItem: CatalogItem; quantity: number }[];
}

export interface EquipmentLine {
  _id: string; // local key
  catalogItemId?: string;
  catalogItemLabel?: string;
  customLabel?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  notes?: string;
}

export interface SerialConflict {
  serialNumber: string;
  bonId: string;
  bonReference: string;
  bonStatus: string;
  collaborateur: string;
}

/** Shape minimale du bon chargé en mode édition. */
export interface EditableBon {
  id: string;
  reference: string;
  status: string;
  filialeId: string;
  civilite: 'mme' | 'mr';
  dateMiseDisposition: string;
  dateRestitution?: string | null;
  notes?: string | null;
  collaborateur: UserResult;
  equipments: Array<{
    catalogItem?: { id: string; brand: string; model: string } | null;
    customLabel?: string | null;
    serialNumber?: string | null;
    inventoryNumber?: string | null;
    notes?: string | null;
  }>;
}

let lineCounter = 0;
export const newLine = (partial?: Partial<EquipmentLine>): EquipmentLine => ({
  _id: String(lineCounter++),
  ...partial,
});
