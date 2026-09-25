/** Périodes et presets partagés par le sélecteur de période du tableau de bord.
 *  Toutes les dates sont des chaînes civiles `YYYY-MM-DD` (Europe/Paris) ; les
 *  calculs se font exclusivement en `Date.UTC` (jamais `toISOString()` sur une
 *  date locale, qui déraperait d'un jour selon le fuseau du navigateur). */

export type Preset = '7d' | '30d' | '90d' | '12m';

export const PRESETS: readonly Preset[] = ['7d', '30d', '90d', '12m'];

export const PRESET_LABELS: Record<Preset, string> = {
  '7d': '7 j',
  '30d': '30 j',
  '90d': '90 j',
  '12m': '12 mois',
};

const PRESET_DAYS: Record<Preset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};

export interface DateRange {
  from: string;
  to: string;
}

function parseIsoDate(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { y, m, d };
}

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** Bornes `{ from, to }` d'un preset, `to` = `today` inclus. */
export function presetRange(preset: Preset, today: string): DateRange {
  const { y, m, d } = parseIsoDate(today);
  const toMs = Date.UTC(y, m - 1, d);
  const days = PRESET_DAYS[preset];
  const fromMs = toMs - (days - 1) * 86_400_000;
  return { from: toIso(fromMs), to: toIso(toMs) };
}

/** Retrouve le preset correspondant à une plage (bouton actif dans l'URL) ;
 *  `null` si la plage ne correspond à aucun preset (période personnalisée). */
export function detectPreset(range: DateRange, today: string): Preset | null {
  if (range.to !== today) return null;
  for (const preset of PRESETS) {
    if (presetRange(preset, today).from === range.from) return preset;
  }
  return null;
}

/** @deprecated Importer depuis `@/lib/dates` : réexportée le temps que le
 *  formulaire de bon (`pages/bons/create`) change son import. */
export { todayInParis } from './dates';
