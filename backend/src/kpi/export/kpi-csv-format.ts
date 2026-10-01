import { formatParisDate, formatParisDateTimeFr, PARIS_TIME_ZONE } from '../../common/dates/paris';
import type { CsvCell } from '../../common/csv';
import type { Compared, KpiEnvelope, RatioCompared } from '../kpi-types';

/**
 * Briques communes aux exports « Exporter ces indicateurs » du tableau de
 * bord (un fichier par onglet : Parc, Délais, Incidents).
 *
 * Un fichier = un tableau à six colonnes, lisible tel quel dans Excel :
 * rubrique (le bloc de l'écran), indicateur (le libellé de la carte),
 * portée (« au 01/10/2026 » pour un état du jour, « du … au … » pour un flux
 * sur la période), valeur, valeur de la période précédente (flux seulement)
 * et unité. Les premières lignes (« Contexte ») rappellent l'onglet, les
 * périodes, la filiale et l'heure du calcul.
 *
 * Règles des exports (docs/api-conventions.md) : libellés d'écran, jamais de
 * code technique ; dates JJ/MM/AAAA et heure de Paris ; nombres décimaux à
 * la française (virgule) ; jamais de valeur négative.
 */

export const KPI_CSV_HEADER: readonly string[] = [
  'Rubrique', 'Indicateur', 'Portée', 'Valeur', 'Période précédente', 'Unité',
];

export type KpiCsvRow = readonly CsvCell[];

/** Portées de l'onglet exporté, déjà mises en mots. */
export interface KpiCsvScope {
  /** « au 01/10/2026 » : état du jour, à la date du calcul. */
  readonly state: string;
  /** « du 01/09/2026 au 30/09/2026 » : flux sur la période. */
  readonly flow: string;
}

const decimalFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, useGrouping: false });

/** « du 01/09/2026 au 30/09/2026 » pour deux dates civiles AAAA-MM-JJ. */
export function rangeLabel(range: { from: string; to: string }): string {
  return `du ${formatParisDate(`${range.from}T12:00:00Z`)} au ${formatParisDate(`${range.to}T12:00:00Z`)}`;
}

/** Portées de l'onglet : état au jour du calcul, flux sur la période. */
export function scopeOf(envelope: KpiEnvelope): KpiCsvScope {
  return { state: `au ${formatParisDate(envelope.asOf)}`, flow: rangeLabel(envelope.period) };
}

/** Nombre écrit à la française (« 2,5 »), cellule vide sans donnée. Une
 *  valeur négative n'a pas de sens dans ces indicateurs : ramenée à 0. */
export function decimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return decimalFormatter.format(Math.max(0, value));
}

/** Part (0 à 1) écrite en pourcentage (« 42,5 »), cellule vide sans donnée. */
export function percent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? '' : decimal(ratio * 100);
}

/** Ligne d'un état du jour (pas de période précédente). */
export function stateRow(rubrique: string, indicateur: string, scope: KpiCsvScope, value: string, unit: string): KpiCsvRow {
  return [rubrique, indicateur, scope.state, value, '', unit];
}

/** Ligne d'une valeur de la période, sans comparaison (nombre de documents
 *  sur lequel porte une médiane, motif, part). */
export function periodRow(rubrique: string, indicateur: string, scope: KpiCsvScope, value: string, unit: string): KpiCsvRow {
  return [rubrique, indicateur, scope.flow, value, '', unit];
}

/** Ligne d'un flux sur la période, comparé à la période précédente. */
export function flowRow(
  rubrique: string,
  indicateur: string,
  scope: KpiCsvScope,
  compared: Compared | RatioCompared,
  unit: string,
  format: (value: number | null) => string = decimal,
): KpiCsvRow {
  return [rubrique, indicateur, scope.flow, format(compared.current), format(compared.previous), unit];
}

/** Unité accordée au nombre (« 1 bon », « 3 bons »). */
export function unitFor(count: number | null, singular: string, plural: string): string {
  return (count ?? 0) > 1 ? plural : singular;
}

/** Bucket d'une série, en mots : « 05/09/2026 », « semaine du 01/09/2026 »,
 *  « septembre 2026 ». */
export function bucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const date = formatParisDate(`${bucket}T12:00:00Z`);
  if (granularity === 'week') return `semaine du ${date}`;
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS_TIME_ZONE, month: 'long', year: 'numeric' })
      .format(new Date(`${bucket}T12:00:00Z`));
  }
  return date;
}

/** Lignes « Contexte » en tête du fichier. */
export function contextRows(tabLabel: string, envelope: KpiEnvelope, filialeName: string | null): KpiCsvRow[] {
  const context = 'Contexte';
  return [
    [context, 'Onglet du tableau de bord', '', tabLabel, '', ''],
    [context, 'Période', '', rangeLabel(envelope.period), '', ''],
    [context, 'Période précédente (comparaison)', '', rangeLabel(envelope.previous), '', ''],
    [context, 'Filiale', '', filialeName ?? 'Toutes les filiales', '', ''],
    [context, 'Calculé le', '', formatParisDateTimeFr(envelope.asOf), '', ''],
  ];
}
