import type { BonStatus } from '@/types';

// ─── Bon detail types ────────────────────────────────────────────────────────

export interface SignatureInfo {
  id: string;
  type: 'mise_disposition' | 'restitution' | 'it_cachet' | 'pv_cloture';
  signed: boolean;
  signedAt?: string | Date;
  signerEmail?: string;
  isInPerson: boolean;
  mentionLuApprouve: boolean;
  tokenExpiresAt: string | Date;
  createdAt?: string | Date;
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
  /** Empreinte SHA-256 du document (chaîne de preuve) */
  sha256?: string | null;
}

export interface PendingItAction {
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  onSigned: () => Promise<void>;
}

export interface NotificationLog {
  id: string;
  type: string;
  status: 'sent' | 'failed';
  recipientEmail: string;
  errorMessage?: string | null;
  reminderNumber?: number | null;
  sentAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function equipmentLabel(eq: EquipmentItem): string {
  return eq.catalogItem
    ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
    : eq.customLabel || '—';
}

export const SNAPSHOT_LABELS: Record<string, string> = {
  signature_it_mise_disposition: 'Cachet IT — Mise à disposition',
  signature_collab_mise_disposition: 'Signature collab — Mise à disposition',
  signature_it_restitution: 'Cachet IT — Restitution',
  signature_collab_restitution: 'Signature collab — Restitution',
  cloture_equipements_manquants: 'PV — Équipements non restitués',
  avenant_equipement_retrouve: 'Avenant — Équipement(s) retrouvé(s)',
};

export function sigTypeLabel(type: string): string {
  if (type === 'mise_disposition') return 'Mise à disposition';
  if (type === 'restitution') return 'Restitution';
  if (type === 'it_cachet') return 'Cachet IT';
  if (type === 'pv_cloture') return 'PV équipements non restitués';
  return type;
}
