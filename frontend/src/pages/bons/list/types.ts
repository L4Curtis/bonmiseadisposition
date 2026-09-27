import { type BonStatus } from '@/types';
import { type SignatureSummary } from '@/lib/bon-helpers';
import type { BonLateness, BonSubStatus, PendingSignature as PendingDocument } from '@/contracts';

/** Signature NON signée d'un bon, telle que renvoyée par la liste (l'historique
 *  complet des signatures reste sur la fiche, GET /bons/:id). */
export interface PendingSignature extends SignatureSummary {
  /** Date d'envoi du lien. */
  createdAt: string;
}

/** Un bon tel que renvoyé par `GET /bons` (projection allégée BON_LIST_SELECT
 *  côté backend) — seuls les champs utilisés par la liste sont déclarés. */
export interface Bon {
  id: string;
  reference: string;
  status: BonStatus;
  /** Adresse à laquelle partent les liens de signature ; `null` pour un
   *  collaborateur sans email (signature présentielle uniquement). */
  collaborateurEmail: string | null;
  dateMiseDisposition: string;
  dateRestitution: string | null;
  createdAt: string;
  /** Dernière activité : chaque étape du cycle de vie fait avancer cette date. */
  updatedAt: string;
  collaborateur: { id: string; displayName: string; email: string | null };
  filiale: { id: string; displayName: string };
  createdBy: { id: string; displayName: string };
  equipments: { id: string }[];
  signatures: PendingSignature[];
  /** Sous-état de « Restitution en cours », calculé par le serveur. */
  subStatus?: BonSubStatus | null;
  /** Document qui attend la signature du collaborateur (machine à états). */
  pendingSignature?: PendingDocument | null;
  /** Retards calculés par le serveur. */
  lateness?: BonLateness;
  /** Un lien peut partir par email vers le compte du collaborateur. */
  canSendLink?: boolean;
}
