import type { LinkSignatureType, SendChecksResponse } from '@/contracts';
import type { FailedItAction, PendingItAction } from '../types';

/** Gestes tracés qui demandent un motif. */
export type ReasonAction = 'cancel' | 'handover_without_signature' | 'close_without_signature';

/** Canal d'une remise ou d'une restitution. */
export type Channel = 'email' | 'in_person';

/**
 * Fenêtre ouverte sur la fiche : une seule à la fois, décrite par son genre
 * et ce qu'elle doit afficher. Remplace une dizaine de booléens indépendants
 * (deux fenêtres ne peuvent plus s'ouvrir l'une sur l'autre par erreur).
 */
export type BonDialog =
  | { readonly kind: 'it-sign'; readonly action: PendingItAction }
  | { readonly kind: 'failed-it'; readonly failed: FailedItAction }
  | { readonly kind: 'send-checks'; readonly checks: SendChecksResponse; readonly channel: Channel }
  | { readonly kind: 'in-person'; readonly type: LinkSignatureType; readonly token: string }
  | { readonly kind: 'restitution'; readonly channel: Channel }
  | { readonly kind: 'undo-return' }
  | { readonly kind: 'not-returned' }
  | { readonly kind: 'mark-found' }
  | { readonly kind: 'reason'; readonly action: ReasonAction }
  | { readonly kind: 'resend-confirm'; readonly sentAt: string }
  | { readonly kind: 'edit-sent' };

export type SetDialog = (dialog: BonDialog | null) => void;
export type SetActionLoading = (key: string | null) => void;
