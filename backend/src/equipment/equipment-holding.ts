import type { BonStatus } from '@prisma/client';
import { PARC_BON_STATUSES } from '../common/bon-predicates';

/**
 * Situation d'un équipement sur UN bon de son historique, calculée par le
 * serveur pour que l'écran ne dise jamais « Chez X » à tort :
 *  - `planned` : bon brouillon, rien n'a été remis ;
 *  - `handover_to_sign` : remis, remise pas encore signée ;
 *  - `with_collaborateur` : chez le collaborateur (bon en cours, restitution
 *    en cours ou contesté) ;
 *  - `returned` / `not_returned` : rendu, ou déclaré non restitué ;
 *  - `cancelled` : bon annulé ; `closed` : bon clôturé sans trace de retour.
 */
export type EquipmentHolding =
  | 'planned'
  | 'handover_to_sign'
  | 'with_collaborateur'
  | 'returned'
  | 'not_returned'
  | 'cancelled'
  | 'closed';

export interface EquipmentHoldingInput {
  returnedAt: Date | null;
  notReturned: boolean;
  bonStatus: BonStatus;
}

export function equipmentHolding({ returnedAt, notReturned, bonStatus }: EquipmentHoldingInput): EquipmentHolding {
  if (notReturned) return 'not_returned';
  if (returnedAt) return 'returned';
  if (bonStatus === 'draft') return 'planned';
  if (bonStatus === 'cancelled') return 'cancelled';
  if (bonStatus === 'sent_mise_dispo') return 'handover_to_sign';
  if ((PARC_BON_STATUSES as readonly string[]).includes(bonStatus)) return 'with_collaborateur';
  return 'closed';
}
