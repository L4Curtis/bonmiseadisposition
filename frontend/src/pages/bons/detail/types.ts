import type { BonStatus } from '@/types';
import type { BonDetail, BonEquipment, SafeSignature } from '@/contracts';
import { PDF_SNAPSHOT_LABELS, SIGNATURE_TYPE_LABELS, labelOrKey } from '@/domain/labels';

// ─── Fiche d'un bon (contrat du serveur) ─────────────────────────────────────

/** Fiche d'un bon telle que la renvoie `GET /bons/:id` pour l'IT : colonnes,
 *  état calculé par la machine à états, actions possibles. */
export type BonFiche = BonDetail;
export type FicheEquipment = BonEquipment;
export type FicheSignature = SafeSignature;

// ─── Anciennes formes (fiche du collaborateur, lot 2C) ───────────────────────
// Gardées telles quelles : la fiche du collaborateur les importe encore.

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
  /** Étape du cachet IT (exposée par le backend — voir `common/types.ts`
   *  BON_SELECT / sanitizeBonForResponse). Optionnel car absent sur les
   *  cachets posés avant l'introduction du champ : dans ce cas, BonSignatures
   *  déduit l'étape (mise à dispo / restitution) de l'ordre chronologique des
   *  signatures `it_cachet`. */
  pdfType?: 'mise_disposition' | 'restitution';
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

/** Signature IT à poser avant de transmettre un lien, et la suite du parcours. */
export interface PendingItAction {
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  /** Suite du parcours, une fois la signature IT enregistrée. Renvoie `false`
   *  (au lieu de rejeter) en cas d'échec, déjà signalé à l'écran : la fiche
   *  propose alors de la relancer sans signer à nouveau. */
  onSigned: () => Promise<boolean>;
  /** Message à afficher si l'IT ferme la fenêtre sans signer (ce qui est
   *  déjà enregistré, ce qui ne part pas). */
  dismissNotice?: string;
}

/** Signature IT déjà enregistrée, mais la suite (envoi du lien…) a échoué :
 *  on la relance SANS signer à nouveau. */
export interface FailedItAction {
  pdfType: 'mise_disposition' | 'restitution';
  retry: () => Promise<boolean>;
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

export function equipmentLabel(eq: {
  catalogItem?: { brand: string; model: string } | null;
  customLabel?: string | null;
}): string {
  return eq.catalogItem
    ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
    : eq.customLabel || '—';
}

/** Version figée d'un PDF (lexique). */
export const SNAPSHOT_LABELS: Readonly<Record<string, string>> = PDF_SNAPSHOT_LABELS;

/** Étape de signature, en titre (lexique). */
export function sigTypeLabel(type: string): string {
  return labelOrKey(SIGNATURE_TYPE_LABELS, type);
}
