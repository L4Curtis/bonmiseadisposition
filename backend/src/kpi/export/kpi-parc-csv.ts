import { formatParisDate } from '../../common/dates/paris';
import type { KpiParcResponse } from '../kpi-types';
import {
  bucketLabel, decimal, flowRow, KpiCsvRow, KpiCsvScope, percent, scopeOf, stateRow, unitFor,
} from './kpi-csv-format';

/**
 * Lignes de l'export de l'onglet « Parc » : mêmes blocs et mêmes libellés
 * que l'écran (cartes, répartitions, « Retour en retard », non-restitutions,
 * évolution du parc).
 */
export function parcCsvRows(data: KpiParcResponse): KpiCsvRow[] {
  const scope = scopeOf(data);
  return [
    ...loanedRows(data, scope),
    ...returnOverdueRows(data, scope),
    ...notReturnedRows(data, scope),
    ...data.loaned.series.map((point) => stateRow(
      'Évolution du parc',
      'Équipements chez les collaborateurs en fin de journée',
      { ...scope, state: bucketLabel(point.bucket, data.period.granularity) },
      decimal(point.count),
      unitFor(point.count, 'équipement', 'équipements'),
    )),
  ];
}

function loanedRows(data: KpiParcResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const { loaned } = data;
  const equipments = (count: number) => unitFor(count, 'équipement', 'équipements');
  return [
    stateRow('Parc prêté', 'Équipements chez les collaborateurs', scope, decimal(loaned.total), equipments(loaned.total)),
    stateRow('Parc prêté', 'Bons concernés', scope, decimal(loaned.bons), unitFor(loaned.bons, 'bon', 'bons')),
    stateRow('Qualité des données', 'Avec numéro de série', scope, percent(loaned.serialCoverage), '%'),
    stateRow('Qualité des données', 'Hors catalogue', scope, percent(loaned.offCatalogShare), '%'),
    ...loaned.bySituation.map((s) => stateRow('Par situation', s.label, scope, decimal(s.count), equipments(s.count))),
    ...loaned.byCategory.map((c) => stateRow('Par catégorie', c.label, scope, decimal(c.count), equipments(c.count))),
    ...loaned.byFiliale.map((f) => stateRow('Par filiale', f.name, scope, decimal(f.count), equipments(f.count))),
    ...loaned.topModels.map((m) => stateRow('Modèles les plus prêtés', m.label, scope, decimal(m.count), equipments(m.count))),
  ];
}

function returnOverdueRows(data: KpiParcResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const overdue = data.returnOverdue;
  const rubrique = 'Retour en retard';
  return [
    stateRow(rubrique, 'Équipements en retour en retard', scope, decimal(overdue.equipments),
      unitFor(overdue.equipments, 'équipement', 'équipements')),
    stateRow(rubrique, 'Bons concernés', scope, decimal(overdue.bons), unitFor(overdue.bons, 'bon', 'bons')),
    stateRow(rubrique, 'Retard moyen par bon', scope, decimal(overdue.avgDays), 'jours'),
    stateRow(rubrique, 'Retard médian par bon', scope, decimal(overdue.medianDays), 'jours'),
    ...overdue.top.map((row) => stateRow(
      'Retour en retard : les 10 bons les plus en retard',
      `${row.reference} — ${row.collaborateur} (${row.filiale}), retour prévu le ${formatParisDate(`${row.dateRestitution}T12:00:00Z`)}, `
        + `${row.equipments} ${unitFor(row.equipments, 'équipement', 'équipements')}`,
      scope,
      decimal(row.daysLate),
      unitFor(row.daysLate, 'jour de retard', 'jours de retard'),
    )),
  ];
}

function notReturnedRows(data: KpiParcResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const notReturned = data.notReturned;
  const rubrique = 'Non-restitutions';
  return [
    stateRow(rubrique, 'Encore non restitués', scope, decimal(notReturned.openNow),
      unitFor(notReturned.openNow, 'équipement', 'équipements')),
    flowRow(rubrique, 'Équipements déclarés non restitués', scope, notReturned.declared, 'équipements'),
    flowRow(rubrique, 'Équipements retrouvés', scope, notReturned.found, 'équipements'),
    flowRow(rubrique, 'Bons clôturés avec au moins un équipement non restitué', scope,
      notReturned.closedBonsShare, '%', percent),
  ];
}
