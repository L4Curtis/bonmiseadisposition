import type { BonStatus } from '@/types';

export interface SignatureInfo {
  id: string;
  type: string;
  signed: boolean;
  token: string;
  tokenExpiresAt: string | null | undefined;
  isInPerson?: boolean | null;
  /** Champ backend futur : remplacera `token` pour les signatures présentielles. */
  inPersonPending?: boolean;
}

export interface BonCollab {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  filiale: { displayName: string };
  equipments: { id: string }[];
  signatures: SignatureInfo[];
}
