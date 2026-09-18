import { STATUS_LABELS } from '../common/status-labels';
import { escapeCsvCell } from '../common/bon-predicates';
import { daysSince } from './inventory-dates';
import type { InventoryItemView } from './inventory-mapper';

const HEADERS = [
  'Équipement', 'Catégorie', 'N° série', 'N° inventaire',
  'Collaborateur', 'Email', 'Service', 'Filiale',
  'Référence bon', 'Statut bon', 'Situation',
  'Date mise à disposition', 'Ancienneté (jours)',
  'Date restitution prévue', 'Retard (jours)',
];

function formatFrDate(date: Date | null): string {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '';
}

/**
 * Construit le CSV d'export de l'inventaire — reflète exactement les
 * colonnes du tableau (ancienneté et retard compris), pour les mêmes
 * équipements que ceux résolus par `InventoryService.buildWhere` /
 * `buildOrderBy` (mêmes filtres et même tri que la liste paginée).
 *
 * `now` est injectable (tests) pour figer le calcul d'ancienneté/retard.
 */
export function buildInventoryCsv(items: InventoryItemView[], now: Date = new Date()): string {
  const dataRows = items.map((it) => {
    const anciennete = daysSince(new Date(it.dateMiseDisposition), now);
    const retard = it.dateRestitution ? daysSince(new Date(it.dateRestitution), now) : null;

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
      STATUS_LABELS[it.bonStatus] ?? it.bonStatus,
      it.situationLabel,
      formatFrDate(new Date(it.dateMiseDisposition)),
      String(anciennete),
      formatFrDate(it.dateRestitution ? new Date(it.dateRestitution) : null),
      retard !== null && retard > 0 ? String(retard) : '',
    ].map(escapeCsvCell);
  });

  const csv = [HEADERS.map(escapeCsvCell).join(';'), ...dataRows.map((r) => r.join(';'))].join('\n');
  // BOM UTF-8 (U+FEFF) pour Excel — via fromCharCode pour éviter tout
  // caractère littéral invisible dans le source.
  return String.fromCharCode(0xfeff) + csv;
}
