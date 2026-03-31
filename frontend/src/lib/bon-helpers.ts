import type { BonStatus } from '@/types';

export interface SignatureSummary {
  type: string;
  signed: boolean;
}

/** Statuts indiquant une attente d'action (signature collaborateur) */
export const WAITING_STATUSES: readonly BonStatus[] = ['sent_mise_dispo', 'sent_restitution'];

/** Doit-on afficher l'icône d'attente sur le badge de statut ? */
export function isWaitingStatus(status: BonStatus): boolean {
  return (WAITING_STATUSES as readonly string[]).includes(status);
}

/** Le bon partially_returned a-t-il une signature en attente ? */
export function hasPendingSignature(
  bon: { status: BonStatus; signatures?: SignatureSummary[] },
): boolean {
  if (bon.status !== 'partially_returned') return false;
  return bon.signatures?.some(
    (s) => !s.signed && ['restitution', 'pv_cloture'].includes(s.type),
  ) ?? false;
}
