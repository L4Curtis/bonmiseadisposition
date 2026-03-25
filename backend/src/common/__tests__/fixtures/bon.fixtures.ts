/**
 * Bon fixtures for unit and integration tests.
 *
 * Each fixture is a factory function that returns a fresh object to prevent
 * mutation leaking between tests. The shape matches the BON_SELECT_SHAPE
 * query result (BonWithRelations).
 */

// ── Shared IDs (deterministic for assertions) ────────────────────────────────

const IDS = {
  filiale: 'filiale-001',
  collaborateur: 'user-collab-001',
  createdBy: 'user-tech-001',
  catalogLaptop: 'cat-laptop-001',
  catalogScreen: 'cat-screen-001',
  catalogMouse: 'cat-mouse-001',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseFiliale() {
  return {
    id: IDS.filiale,
    name: 'filiale-demo',
    displayName: 'Groupe Livio - Filiale Demo',
    logoPath: null as string | null,
    stampPath: null as string | null,
    address: '10 rue de la Paix, 75002 Paris',
    siret: '12345678901234',
    active: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

function baseCollaborateur() {
  return {
    id: IDS.collaborateur,
    displayName: 'Jean Dupont',
    email: 'jean.dupont@groupelivio.fr',
    department: 'Marketing',
  };
}

function baseCreatedBy() {
  return {
    id: IDS.createdBy,
    displayName: 'Marie Martin',
    email: 'marie.martin@groupelivio.fr',
  };
}

function baseEquipments() {
  return [
    {
      id: 'equip-001',
      bonId: '', // will be set per fixture
      catalogItemId: IDS.catalogLaptop,
      catalogItem: {
        id: IDS.catalogLaptop,
        brand: 'Lenovo',
        model: 'ThinkBook 16 G6',
        category: 'pc_portable',
      },
      customLabel: null as string | null,
      serialNumber: 'SN-LP-2026-001',
      inventoryNumber: 'INV-001',
      notes: null as string | null,
      order: 0,
      returnedAt: null as Date | null,
      notReturned: false,
      notReturnedReason: null as string | null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
    },
    {
      id: 'equip-002',
      bonId: '',
      catalogItemId: IDS.catalogScreen,
      catalogItem: {
        id: IDS.catalogScreen,
        brand: 'Dell',
        model: 'UltraSharp U2723QE',
        category: 'ecran',
      },
      customLabel: null as string | null,
      serialNumber: 'SN-EC-2026-042',
      inventoryNumber: 'INV-002',
      notes: null as string | null,
      order: 1,
      returnedAt: null as Date | null,
      notReturned: false,
      notReturnedReason: null as string | null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
    },
    {
      id: 'equip-003',
      bonId: '',
      catalogItemId: IDS.catalogMouse,
      catalogItem: {
        id: IDS.catalogMouse,
        brand: 'Logitech',
        model: 'MX Master 3S',
        category: 'souris',
      },
      customLabel: null as string | null,
      serialNumber: null as string | null,
      inventoryNumber: null as string | null,
      notes: 'Sans fil',
      order: 2,
      returnedAt: null as Date | null,
      notReturned: false,
      notReturnedReason: null as string | null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
    },
  ];
}

function setEquipmentBonId(equipments: ReturnType<typeof baseEquipments>, bonId: string) {
  return equipments.map((eq) => ({ ...eq, bonId }));
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Bon in draft status — no signatures, not yet sent to collaborator. */
export function draftBon() {
  const id = 'bon-draft-001';
  return {
    id,
    reference: 'BMD-2026-0001',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'draft' as const,
    dateMiseDisposition: new Date('2026-01-15'),
    dateRestitution: null as Date | null,
    notes: null as string | null,
    createdAt: new Date('2026-01-15T09:00:00Z'),
    updatedAt: new Date('2026-01-15T09:00:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [] as Array<{
      id: string;
      bonId: string;
      type: 'mise_disposition' | 'restitution' | 'it_cachet';
      token: string;
      tokenExpiresAt: Date;
      signed: boolean;
      signatureImagePath: string | null;
      signedAt: Date | null;
      signerEmail: string | null;
      signerIp: string | null;
      signerUserAgent: string | null;
      mentionLuApprouve: boolean;
      isInPerson: boolean;
      initiatedById: string | null;
      createdAt: Date;
    }>,
  };
}

/** Bon sent for mise a disposition — waiting for collaborator signature. */
export function sentMiseDispoBon() {
  const id = 'bon-sent-mise-001';
  return {
    id,
    reference: 'BMD-2026-0010',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'sent_mise_dispo' as const,
    dateMiseDisposition: new Date('2026-02-01'),
    dateRestitution: null as Date | null,
    notes: 'Premier poste de travail',
    createdAt: new Date('2026-02-01T08:30:00Z'),
    updatedAt: new Date('2026-02-01T08:35:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [
      {
        id: 'sig-mise-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-mise-dispo-001',
        tokenExpiresAt: new Date('2026-02-08T08:35:00Z'),
        signed: false,
        signatureImagePath: null as string | null,
        signedAt: null as Date | null,
        signerEmail: null as string | null,
        signerIp: null as string | null,
        signerUserAgent: null as string | null,
        mentionLuApprouve: false,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-02-01T08:35:00Z'),
      },
    ],
  };
}

/** Active bon — mise a disposition signed by collaborator. */
export function activeBon() {
  const id = 'bon-active-001';
  return {
    id,
    reference: 'BMD-2026-0020',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'active' as const,
    dateMiseDisposition: new Date('2026-02-01'),
    dateRestitution: null as Date | null,
    notes: null as string | null,
    createdAt: new Date('2026-02-01T08:30:00Z'),
    updatedAt: new Date('2026-02-02T14:00:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [
      {
        id: 'sig-it-001',
        bonId: id,
        type: 'it_cachet' as const,
        token: 'token-it-cachet-001',
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath: 'bon-active-001_it_cachet_1706788200000.enc',
        signedAt: new Date('2026-02-01T08:32:00Z'),
        signerEmail: 'marie.martin@groupelivio.fr',
        signerIp: '192.168.1.10',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: null as string | null,
        createdAt: new Date('2026-02-01T08:32:00Z'),
      },
      {
        id: 'sig-collab-mise-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-collab-mise-001',
        tokenExpiresAt: new Date('2026-02-08T08:35:00Z'),
        signed: true,
        signatureImagePath: 'bon-active-001_mise_disposition_1706874000000.enc',
        signedAt: new Date('2026-02-02T14:00:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-02-01T08:35:00Z'),
      },
    ],
  };
}

/** Bon sent for restitution — waiting for collaborator signature. */
export function sentRestitutionBon() {
  const id = 'bon-sent-restit-001';
  const active = activeBon();
  return {
    ...active,
    id,
    reference: 'BMD-2026-0030',
    status: 'sent_restitution' as const,
    dateRestitution: new Date('2026-03-15'),
    updatedAt: new Date('2026-03-15T10:00:00Z'),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [
      ...active.signatures.map((sig) => ({ ...sig, bonId: id })),
      {
        id: 'sig-restit-001',
        bonId: id,
        type: 'restitution' as const,
        token: 'token-restit-001',
        tokenExpiresAt: new Date('2026-03-22T10:00:00Z'),
        signed: false,
        signatureImagePath: null as string | null,
        signedAt: null as Date | null,
        signerEmail: null as string | null,
        signerIp: null as string | null,
        signerUserAgent: null as string | null,
        mentionLuApprouve: false,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-03-15T10:00:00Z'),
      },
    ],
  };
}

/** Bon in partially_returned status — some equipment not returned. */
export function partiallyReturnedBon() {
  const id = 'bon-partial-001';
  const equipments = setEquipmentBonId(baseEquipments(), id);
  // First equipment returned, second not returned, third returned
  const modifiedEquipments = [
    { ...equipments[0], returnedAt: new Date('2026-03-16T09:00:00Z') },
    {
      ...equipments[1],
      notReturned: true,
      notReturnedReason: 'Perdu',
    },
    { ...equipments[2], returnedAt: new Date('2026-03-16T09:00:00Z') },
  ];

  return {
    id,
    reference: 'BMD-2026-0040',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'partially_returned' as const,
    dateMiseDisposition: new Date('2026-02-01'),
    dateRestitution: new Date('2026-03-16'),
    notes: 'Un ecran non rendu',
    createdAt: new Date('2026-02-01T08:30:00Z'),
    updatedAt: new Date('2026-03-16T11:00:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: modifiedEquipments,
    signatures: [
      {
        id: 'sig-it-partial-001',
        bonId: id,
        type: 'it_cachet' as const,
        token: 'token-it-partial-001',
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath: 'bon-partial-001_it_cachet.enc',
        signedAt: new Date('2026-02-01T08:32:00Z'),
        signerEmail: 'marie.martin@groupelivio.fr',
        signerIp: '192.168.1.10',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: null as string | null,
        createdAt: new Date('2026-02-01T08:32:00Z'),
      },
      {
        id: 'sig-collab-partial-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-collab-partial-001',
        tokenExpiresAt: new Date('2026-02-08T08:35:00Z'),
        signed: true,
        signatureImagePath: 'bon-partial-001_mise_disposition.enc',
        signedAt: new Date('2026-02-02T14:00:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-02-01T08:35:00Z'),
      },
      {
        id: 'sig-restit-partial-001',
        bonId: id,
        type: 'restitution' as const,
        token: 'token-restit-partial-001',
        tokenExpiresAt: new Date('2026-03-23T10:00:00Z'),
        signed: true,
        signatureImagePath: 'bon-partial-001_restitution.enc',
        signedAt: new Date('2026-03-16T10:30:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-03-16T10:00:00Z'),
      },
    ],
  };
}

/** Archived bon — fully restituted and signed. */
export function archivedBon() {
  const id = 'bon-archived-001';
  const equipments = setEquipmentBonId(baseEquipments(), id).map((eq) => ({
    ...eq,
    returnedAt: new Date('2026-03-20T09:00:00Z'),
  }));

  return {
    id,
    reference: 'BMD-2026-0050',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mme' as const,
    status: 'archived' as const,
    dateMiseDisposition: new Date('2026-01-10'),
    dateRestitution: new Date('2026-03-20'),
    notes: 'Bon cloture normalement',
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-03-20T16:00:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments,
    signatures: [
      {
        id: 'sig-it-arch-001',
        bonId: id,
        type: 'it_cachet' as const,
        token: 'token-it-arch-001',
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath: 'bon-archived-001_it_cachet.enc',
        signedAt: new Date('2026-01-10T08:15:00Z'),
        signerEmail: 'marie.martin@groupelivio.fr',
        signerIp: '192.168.1.10',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: null as string | null,
        createdAt: new Date('2026-01-10T08:15:00Z'),
      },
      {
        id: 'sig-collab-arch-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-collab-arch-001',
        tokenExpiresAt: new Date('2026-01-17T08:20:00Z'),
        signed: true,
        signatureImagePath: 'bon-archived-001_mise_disposition.enc',
        signedAt: new Date('2026-01-11T10:00:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-01-10T08:20:00Z'),
      },
      {
        id: 'sig-restit-arch-001',
        bonId: id,
        type: 'restitution' as const,
        token: 'token-restit-arch-001',
        tokenExpiresAt: new Date('2026-03-27T10:00:00Z'),
        signed: true,
        signatureImagePath: 'bon-archived-001_restitution.enc',
        signedAt: new Date('2026-03-20T15:00:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-03-20T10:00:00Z'),
      },
    ],
  };
}

/** Cancelled bon — cancelled by IT before completion. */
export function cancelledBon() {
  const id = 'bon-cancelled-001';
  return {
    id,
    reference: 'BMD-2026-0060',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'cancelled' as const,
    dateMiseDisposition: new Date('2026-03-01'),
    dateRestitution: null as Date | null,
    notes: 'Annule par erreur de saisie',
    createdAt: new Date('2026-03-01T09:00:00Z'),
    updatedAt: new Date('2026-03-01T09:30:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [
      {
        id: 'sig-mise-cancelled-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-mise-cancelled-001',
        tokenExpiresAt: new Date(0), // expired by cancellation
        signed: false,
        signatureImagePath: null as string | null,
        signedAt: null as Date | null,
        signerEmail: null as string | null,
        signerIp: null as string | null,
        signerUserAgent: null as string | null,
        mentionLuApprouve: false,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-03-01T09:05:00Z'),
      },
    ],
  };
}

/** Contested bon — collaborator has filed a contestation. */
export function contestedBon() {
  const id = 'bon-contested-001';
  return {
    id,
    reference: 'BMD-2026-0070',
    filialeId: IDS.filiale,
    collaborateurId: IDS.collaborateur,
    collaborateurEmail: 'jean.dupont@groupelivio.fr',
    createdById: IDS.createdBy,
    civilite: 'mr' as const,
    status: 'contested' as const,
    dateMiseDisposition: new Date('2026-02-15'),
    dateRestitution: null as Date | null,
    notes: null as string | null,
    createdAt: new Date('2026-02-15T08:00:00Z'),
    updatedAt: new Date('2026-02-20T11:00:00Z'),
    filiale: baseFiliale(),
    collaborateur: baseCollaborateur(),
    createdBy: baseCreatedBy(),
    equipments: setEquipmentBonId(baseEquipments(), id),
    signatures: [
      {
        id: 'sig-it-contested-001',
        bonId: id,
        type: 'it_cachet' as const,
        token: 'token-it-contested-001',
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath: 'bon-contested-001_it_cachet.enc',
        signedAt: new Date('2026-02-15T08:10:00Z'),
        signerEmail: 'marie.martin@groupelivio.fr',
        signerIp: '192.168.1.10',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: null as string | null,
        createdAt: new Date('2026-02-15T08:10:00Z'),
      },
      {
        id: 'sig-collab-contested-001',
        bonId: id,
        type: 'mise_disposition' as const,
        token: 'token-collab-contested-001',
        tokenExpiresAt: new Date(0), // expired by contestation
        signed: true,
        signatureImagePath: 'bon-contested-001_mise_disposition.enc',
        signedAt: new Date('2026-02-16T14:00:00Z'),
        signerEmail: 'jean.dupont@groupelivio.fr',
        signerIp: '10.0.0.42',
        signerUserAgent: 'Mozilla/5.0',
        mentionLuApprouve: true,
        isInPerson: false,
        initiatedById: IDS.createdBy,
        createdAt: new Date('2026-02-15T08:15:00Z'),
      },
    ],
  };
}
