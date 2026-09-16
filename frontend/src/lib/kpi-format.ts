/** Formats FR partagés par les tuiles et graphiques du tableau de bord KPI. */

const numberFormatter = new Intl.NumberFormat('fr-FR');
const decimalFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Entier formaté avec séparateur de milliers FR ; « — » si absent. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
}

/** Ratio 0..1 → pourcentage FR (« 12 % ») ; « — » si absent. */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${decimalFormatter.format(ratio * 100)} %`;
}

/** Durée en jours (« 8 j », « 12,4 j ») ; « — » si absente. */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${decimalFormatter.format(value)} j`;
}

/** Durée en heures : < 48 h affichée en heures, sinon convertie en jours
 *  (plus lisible pour un délai de plusieurs jours). « — » si absente. */
export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value < 48) return `${decimalFormatter.format(value)} h`;
  return formatDays(value / 24);
}

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface ComputedDelta {
  /** Variation en points de pourcentage (ex. 12 pour +12 %) ; null si non calculable. */
  pct: number | null;
  direction: DeltaDirection;
}

/** Variation entre la valeur courante et la valeur précédente.
 *  `previous` null ou nul → non calculable (division par zéro / absence de référence). */
export function computeDelta(current: number | null | undefined, previous: number | null | undefined): ComputedDelta {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) {
    return { pct: null, direction: 'flat' };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const direction: DeltaDirection = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return { pct, direction };
}
