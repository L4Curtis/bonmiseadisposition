/**
 * Jours ouvrés du délai de relance des contestations (décision du 26/09) :
 * du lundi au vendredi, comptés sur le calendrier de Paris. Les jours fériés
 * ne sont pas retirés (non demandé).
 */

const PARIS = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: PARIS, weekday: 'short' });
const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Samedi ou dimanche à Paris. */
export function isParisWeekend(date: Date): boolean {
  const day = WEEKDAY_FORMAT.format(date);
  return day === 'Sat' || day === 'Sun';
}

/** Décalage de l'heure de Paris sur UTC à cet instant (1 h ou 2 h). */
function parisOffsetMs(date: Date): number {
  const p = Object.fromEntries(PARTS_FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Même heure de Paris, `days` jours de calendrier plus tôt (passage à
 *  l'heure d'été ou d'hiver compris). */
function sameParisTimeDaysBefore(date: Date, days: number): Date {
  const naive = new Date(date.getTime() - days * DAY_MS);
  return new Date(naive.getTime() - (parisOffsetMs(naive) - parisOffsetMs(date)));
}

/**
 * Instant situé `count` jours ouvrés avant `now`, à la même heure de Paris :
 * on remonte jour après jour et seuls les jours de semaine comptent. Une
 * contestation reçue avant cet instant attend depuis `count` jours ouvrés.
 */
export function businessDaysBefore(now: Date, count: number): Date {
  let days = 0;
  let counted = 0;
  while (counted < count) {
    days += 1;
    if (!isParisWeekend(sameParisTimeDaysBefore(now, days))) counted += 1;
  }
  return sameParisTimeDaysBefore(now, days);
}
