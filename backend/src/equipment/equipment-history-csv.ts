import { bonStatusLabel } from '../bons/bon-status';
import { buildCsv } from '../common/csv';
import { formatParisDate } from '../common/dates/paris';

const HEADERS: readonly string[] = [
  'Référence bon', 'Statut bon', 'Collaborateur', 'Email', 'Filiale',
  'Désignation', 'N° série', 'N° inventaire',
  'Date mise à disposition', 'Restitution prévue', 'Restitué le', 'Non restitué',
];

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
 * Construit le CSV d'export de l'historique d'un équipement : mêmes entrées,
 * dans le même ordre (plus récent d'abord), que celles affichées à l'écran.
 */
export function buildEquipmentHistoryCsv(items: readonly EquipmentHistoryCsvRow[]): string {
  const rows = items.map((it) => [
    it.bon.reference,
    bonStatusLabel(it.bon.status),
    it.bon.collaborateur.displayName,
    it.bon.collaborateur.email ?? '—',
    it.bon.filiale.displayName,
    it.label ?? '',
    it.serialNumber ?? '',
    it.inventoryNumber ?? '',
    formatParisDate(it.bon.dateMiseDisposition),
    formatParisDate(it.bon.dateRestitution),
    // Instant du retour : daté à l'heure de Paris, pas dans le fuseau du serveur.
    formatParisDate(it.returnedAt),
    it.notReturned ? 'Oui' : '',
  ]);
  return buildCsv({ header: HEADERS, rows });
}
