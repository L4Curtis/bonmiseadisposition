import { type BonStatus } from '@/types';
import { type SignatureSummary } from '@/lib/bon-helpers';
import type { Filiale } from '@/types';

export interface Bon {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  collaborateur: { id: string; displayName: string; email: string; department?: string };
  filiale: Filiale;
  createdBy: { id: string; displayName: string };
  equipments: { id: string }[];
  signatures: SignatureSummary[];
}
