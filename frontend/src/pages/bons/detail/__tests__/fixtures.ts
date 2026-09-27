import type { BonEquipment } from '@/contracts';
import type { BonFiche } from '../types';

/** Ligne d'équipement de la fiche (forme du contrat), chez le collaborateur par défaut. */
export function equipment(overrides: Partial<BonEquipment> & { id: string }): BonEquipment {
  return {
    bonId: 'b1',
    catalogItemId: null,
    customLabel: 'Équipement',
    serialNumber: null,
    inventoryNumber: null,
    notes: null,
    order: 0,
    returnedAt: null,
    notReturned: false,
    notReturnedReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    catalogItem: null,
    returnState: 'out',
    ...overrides,
  };
}

/** Fiche d'un bon « En cours », telle que le serveur la renvoie à l'IT. */
export function bonFiche(overrides: Partial<BonFiche> = {}): BonFiche {
  return {
    id: 'b1',
    reference: 'BON-2026-0001',
    filialeId: 'f1',
    collaborateurId: 'c1',
    collaborateurEmail: 'jean@livio.fr',
    createdById: 'u1',
    civilite: 'mr',
    status: 'active',
    dateMiseDisposition: '2026-01-01T00:00:00.000Z',
    dateRestitution: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    filiale: {
      id: 'f1', name: 'siege', displayName: 'Siège', logoPath: null, address: null, siret: null, active: true,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    collaborateur: { id: 'c1', displayName: 'Jean Dupont', email: 'jean@livio.fr', department: null, civilite: 'mr' },
    createdBy: { id: 'u1', displayName: 'Admin', email: 'admin@livio.fr' },
    equipments: [equipment({ id: 'e1' })],
    signatures: [],
    subStatus: null,
    pendingSignature: null,
    availableActions: [],
    ...overrides,
  };
}
