import { bonStatusLabel } from '../bons/bon-status';
import { buildCsv, type CsvCell } from '../common/csv';
import { formatParisDate, parisDaysSince } from '../common/dates/paris';
import type { InventoryItemView } from './inventory-mapper';

const HEADERS: readonly string[] = [
  'Équipement', 'Catégorie', 'N° série', 'N° inventaire',
  'Collaborateur', 'Email', 'Service', 'Filiale',
  'Référence bon', 'Statut bon', 'Situation',
  'Date mise à disposition', 'Ancienneté (jours)',
  'Date restitution prévue', 'Retard (jours)',
];

/**
 * Construit le CSV d'export de l'inventaire — reflète exactement les
 * colonnes du tableau (ancienneté et retard compris), pour les mêmes
 * équipements que ceux résolus par `InventoryService.buildWhere` /
 * `buildOrderBy` (mêmes filtres et même tri que la liste paginée).
 *
 * `now` est injectable (tests) pour figer le calcul d'ancienneté/retard.
 */
export function buildInventoryCsv(items: InventoryItemView[], now: Date = new Date()): string {
  return buildCsv({ header: HEADERS, rows: items.map((item) => inventoryRow(item, now)) });
}

/** Une ligne du fichier : ancienneté et retard en jours calendaires à Paris. */
function inventoryRow(it: InventoryItemView, now: Date): CsvCell[] {
  const anciennete = parisDaysSince(new Date(it.dateMiseDisposition), now);
  const retard = it.dateRestitution ? parisDaysSince(new Date(it.dateRestitution), now) : null;
  return [
    it.label,
    it.categoryLabel,
    it.serialNumber ?? '',
    it.inventoryNumber ?? '',
    it.collaborateur.displayName,
    // Compagnon de chantier sans compte email (voir User.isManualAccount) :
    // « — » plutôt qu'une cellule vide/« null » dans l'export.
    it.collaborateur.email ?? '—',
    it.collaborateur.department ?? '',
    it.filiale.displayName,
    it.bonReference,
    bonStatusLabel(it.bonStatus),
    it.situationLabel,
    formatParisDate(it.dateMiseDisposition),
    String(anciennete),
    formatParisDate(it.dateRestitution),
    retard !== null && retard > 0 ? String(retard) : '',
  ];
}
