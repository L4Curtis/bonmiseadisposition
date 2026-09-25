/**
 * Formatage des dates — une seule façon de faire pour toute l'application.
 *
 * Toutes les dates s'affichent à l'heure de Paris, quel que soit le fuseau
 * du navigateur : le serveur, les PDF et les emails comptent les jours en
 * Europe/Paris, l'écran doit dire la même chose.
 *
 * | Fonction         | Exemple              | Usage                               |
 * |------------------|----------------------|-------------------------------------|
 * | `formatDate`     | 03/09/2026           | tableaux, fiches (par défaut)       |
 * | `formatDateTime` | 03/09/2026 14:22     | journal, signatures, envois         |
 * | `formatDateLong` | 3 septembre 2026     | en-têtes seulement                  |
 * | `formatTime`     | 14:22                | heure seule (« simulation de 14:22 ») |
 * | `todayInParis`   | 2026-09-24           | valeur de champ date, nom de fichier |
 *
 * Valeur absente ou invalide : « — ».
 */

export const APP_TIME_ZONE = 'Europe/Paris';

/** Affiché à la place d'une date absente ou illisible. */
export const EMPTY_DATE = '—';

/** Date ISO (texte de l'API), objet Date, ou instant en millisecondes (`Date.now()`). */
export type DateInput = string | number | Date | null | undefined;

const numericDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const longDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const time = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// en-CA produit nativement AAAA-MM-JJ.
const isoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Assemble les morceaux voulus d'un formateur Intl (indépendant du séparateur
 *  que choisit le moteur du navigateur). */
function pick(formatter: Intl.DateTimeFormat, date: Date, types: readonly Intl.DateTimeFormatPartTypes[]): string[] {
  const parts = formatter.formatToParts(date);
  return types.map((type) => parts.find((part) => part.type === type)?.value ?? '');
}

/** 03/09/2026 */
export function formatDate(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_DATE;
  const [day, month, year] = pick(numericDate, date, ['day', 'month', 'year']);
  return `${day}/${month}/${year}`;
}

/** 14:22 */
export function formatTime(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_DATE;
  const [hour, minute] = pick(time, date, ['hour', 'minute']);
  return `${hour}:${minute}`;
}

/** 03/09/2026 14:22 */
export function formatDateTime(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_DATE;
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** 3 septembre 2026 — réservé aux en-têtes. */
export function formatDateLong(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_DATE;
  const [day, month, year] = pick(longDate, date, ['day', 'month', 'year']);
  return `${day} ${month} ${year}`;
}

/** Date du jour à Paris, au format AAAA-MM-JJ : valeur par défaut d'un champ
 *  date, bornes de période, date dans un nom de fichier. Toujours alignée sur
 *  le serveur (SQL en `now() AT TIME ZONE 'Europe/Paris'`), même entre minuit
 *  et 2 h, où la date UTC est encore celle de la veille. */
export function todayInParis(): string {
  return isoDay.format(new Date());
}
