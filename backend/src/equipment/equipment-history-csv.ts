import { STATUS_LABELS } from '../common/status-labels';
import { escapeCsvCell } from '../common/bon-predicates';

const HEADERS = [
  'Référence bon', 'Statut bon', 'Collaborateur', 'Email', 'Filiale',
  'Désignation', 'N° série', 'N° inventaire',
  'Date mise à disposition', 'Restitution prévue', 'Rendu le', 'Non rendu',
];

function formatFrDate(date: Date | string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '';
}

/** Une ligne de l'historique d'un matériel — même forme que les `items`
 *  renvoyés par `getEquipmentHistory` (equipment-serial.ts). */
export interface EquipmentHistoryCsvRow {
  label: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  returnedAt: Date | string | null;
  notReturned: boolean;
  bon: {
    reference: string;
    status: string;
    dateMiseDisposition: Date | string;
    dateRestitution?: Date | string | null;
    // Compagnon de chantier sans compte email (voir User.isManualAccount) :
    // `null` possible, affiché « — » plutôt qu'une cellule vide (même
    // convention que reporting/inventory-csv.ts).
    collaborateur: { displayName: string; email: string | null };
    filiale: { displayName: string };
  };
}

/**
 * Construit le CSV d'export de l'historique d'un matériel (page
 * `/materiel/:reference`, lot L1 — A4) : mêmes entrées, dans le même ordre
 * (plus récent d'abord), que celles affichées à l'écran.
 */
export function buildEquipmentHistoryCsv(items: readonly EquipmentHistoryCsvRow[]): string {
  const dataRows = items.map((it) => [
    it.bon.reference,
    STATUS_LABELS[it.bon.status] ?? it.bon.status,
    it.bon.collaborateur.displayName,
    it.bon.collaborateur.email ?? '—',
    it.bon.filiale.displayName,
    it.label ?? '',
    it.serialNumber ?? '',
    it.inventoryNumber ?? '',
    formatFrDate(it.bon.dateMiseDisposition),
    formatFrDate(it.bon.dateRestitution),
    formatFrDate(it.returnedAt),
    it.notReturned ? 'Oui' : '',
  ].map(escapeCsvCell));

  const csv = [HEADERS.map(escapeCsvCell).join(';'), ...dataRows.map((r) => r.join(';'))].join('\n');
  // BOM UTF-8 (U+FEFF) pour Excel — via fromCharCode pour éviter tout
  // caractère littéral invisible dans le source (même convention que
  // reporting/inventory-csv.ts).
  return String.fromCharCode(0xfeff) + csv;
}
