import { BonForPdf } from './pdf.service';

// ─── Preview data ────────────────────────────────────────────────────────────

export const PREVIEW_BON: BonForPdf = {
  id: 'preview-bon-001',
  reference: 'BMD-2026-0042',
  civilite: 'mme',
  status: 'active',
  dateMiseDisposition: new Date('2026-03-15'),
  dateRestitution: null,
  notes: 'Ceci est un aperçu avec des données fictives. Les remarques générales apparaissent ici.',
  filiale: {
    displayName: 'Groupe Livio — Siège',
    name: 'Livio',
    logoPath: null,
    address: '123 Avenue de la République, 75011 Paris',
    siret: '123 456 789 00012',
  },
  collaborateur: {
    displayName: 'Marie Dupont',
    department: 'Direction Financière',
  },
  collaborateurEmail: 'marie.dupont@livio.fr',
  createdBy: {
    displayName: 'Jean Martin',
  },
  equipments: [
    {
      id: 'eq-001',
      catalogItem: { brand: 'Dell', model: 'Latitude 5540' },
      serialNumber: 'SN-2026-001234',
      inventoryNumber: 'INV-LAP-0042',
      notes: 'Avec sacoche',
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
    {
      id: 'eq-002',
      catalogItem: { brand: 'Dell', model: 'U2723QE 27"' },
      serialNumber: 'SN-2026-005678',
      inventoryNumber: 'INV-ECR-0108',
      notes: null,
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
    {
      id: 'eq-003',
      catalogItem: { brand: 'Logitech', model: 'MX Master 3S' },
      serialNumber: null,
      inventoryNumber: 'INV-SOU-0215',
      notes: null,
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
  ],
  signatures: [],
};
