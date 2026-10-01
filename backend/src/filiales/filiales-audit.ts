/**
 * Ce qu'une modification de filiale raconte au journal d'audit. Le nom
 * affiché de la filiale est toujours porté par `details.name` : la phrase du
 * journal (« … a modifié la filiale Livio Nord. ») en a besoin.
 */
import type { Filiale } from '@prisma/client';
import type { AuditAction } from '../audit/audit-actions';
import type { UpdateFilialeDto } from './dto/filiale.dto';

/** Champs de fiche dont le changement est tracé par `filiale_updated`. */
const TRACKED_FIELDS = ['name', 'displayName', 'address', 'siret'] as const;

type FilialeIdentity = Pick<Filiale, 'id' | 'displayName'>;

export interface FilialeAuditEntry {
  readonly action: AuditAction;
  readonly details: { filialeId: string; name: string; changedFields?: string[] };
}

export function filialeIdentity(filiale: FilialeIdentity): { filialeId: string; name: string } {
  return { filialeId: filiale.id, name: filiale.displayName };
}

/**
 * Entrées d'une modification (PUT /filiales/:id) : la désactivation ou la
 * réactivation d'une part, les champs de la fiche réellement changés de
 * l'autre. Une valeur renvoyée identique ne compte pas comme un changement.
 */
export function filialeChangeActions(
  before: Pick<Filiale, 'id' | 'displayName' | 'active' | (typeof TRACKED_FIELDS)[number]>,
  dto: UpdateFilialeDto,
): FilialeAuditEntry[] {
  const identity = filialeIdentity({ id: before.id, displayName: dto.displayName ?? before.displayName });
  const entries: FilialeAuditEntry[] = [];
  if (dto.active !== undefined && dto.active !== before.active) {
    entries.push({ action: dto.active ? 'filiale_reactivated' : 'filiale_deactivated', details: identity });
  }
  const changedFields = TRACKED_FIELDS.filter((field) => dto[field] !== undefined && dto[field] !== before[field]);
  if (changedFields.length > 0) {
    entries.push({ action: 'filiale_updated', details: { ...identity, changedFields: [...changedFields] } });
  }
  return entries;
}
