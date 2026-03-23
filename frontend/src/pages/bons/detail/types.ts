import type { BonStatus } from '@/types';

// ─── Bon detail types ────────────────────────────────────────────────────────

export interface SignatureInfo {
  id: string;
  type: string;
  signed: boolean;
  signedAt?: string;
  signerEmail?: string;
  isInPerson: boolean;
  mentionLuApprouve: boolean;
  tokenExpiresAt: string;
}

export interface BonDetailData {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  notes?: string;
  createdAt: string;
  collaborateur: { id: string; displayName: string; email: string; department?: string };
  collaborateurEmail: string;
  filiale: { id: string; name: string; displayName: string; address?: string; siret?: string };
  createdBy: { id: string; displayName: string; email: string };
  equipments: EquipmentItem[];
  signatures: SignatureInfo[];
}

export interface EquipmentItem {
  id: string;
  catalogItem?: { id: string; brand: string; model: string; category: string };
  customLabel?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  notes?: string;
  order: number;
  returnedAt?: string;
  notReturned?: boolean;
  notReturnedReason?: string;
}

export interface PdfSnapshotInfo {
  type: string;
  filename: string;
  createdAt: string;
}

export interface PendingItAction {
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  onSigned: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function equipmentLabel(eq: EquipmentItem): string {
  return eq.catalogItem
    ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
    : eq.customLabel || '\u2014';
}

export const SNAPSHOT_LABELS: Record<string, string> = {
  signature_it_mise_disposition: 'Cachet IT \u2014 Mise \u00e0 disposition',
  signature_collab_mise_disposition: 'Signature collab \u2014 Mise \u00e0 disposition',
  signature_it_restitution: 'Cachet IT \u2014 Restitution',
  signature_collab_restitution: 'Signature collab \u2014 Restitution',
  cloture_equipements_manquants: 'PV \u2014 \u00c9quipements non restitu\u00e9s',
  avenant_equipement_retrouve: 'Avenant \u2014 \u00c9quipement(s) retrouv\u00e9(s)',
};

export function sigTypeLabel(type: string): string {
  if (type === 'mise_disposition') return 'Mise \u00e0 disposition';
  if (type === 'restitution') return 'Restitution';
  if (type === 'it_cachet') return 'Cachet IT';
  if (type === 'pv_cloture') return 'PV \u00e9quipements non restitu\u00e9s';
  return type;
}
