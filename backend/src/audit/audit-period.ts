import { BadRequestException } from '@nestjs/common';

/** Fuseau de référence des dates civiles saisies dans les filtres du journal. */
const PARIS_TZ = 'Europe/Paris';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parisPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parisWallClockMs(instant: Date): number {
  const parts = Object.fromEntries(
    parisPartsFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
}

/** Instant UTC correspondant à minuit (heure de Paris) du jour civil
 *  `YYYY-MM-DD`, indépendamment du fuseau de la machine : le poste de dev est
 *  à l'heure de Paris, le conteneur de production en UTC — l'ancien
 *  `setHours(23, 59, …)` donnait une borne différente selon la machine. */
export function parisDayStartUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  // Décalage Paris/UTC à cet instant (1 h ou 2 h selon l'heure d'été), puis
  // seconde passe pour le cas où minuit tombe de l'autre côté du changement.
  const firstGuess = naive - (parisWallClockMs(new Date(naive)) - naive);
  return new Date(naive - (parisWallClockMs(new Date(firstGuess)) - firstGuess));
}

function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

function parseBound(value: string, name: string): string {
  if (!ISO_DATE_RE.test(value) || !isRealCalendarDate(value)) {
    throw new BadRequestException(`Paramètre ${name} invalide (date AAAA-MM-JJ attendue)`);
  }
  return value;
}

/**
 * Traduit les bornes `dateFrom` / `dateTo` (jours civils à l'heure de Paris,
 * bornes incluses) en intervalle d'instants `[gte, lt)` pour Prisma : le jour
 * de fin est inclus en entier grâce à la borne exclusive « lendemain minuit ».
 */
export function resolveAuditPeriod(
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const from = dateFrom ? parseBound(dateFrom, 'dateFrom') : undefined;
  const to = dateTo ? parseBound(dateTo, 'dateTo') : undefined;
  if (from && to && from > to) {
    throw new BadRequestException('La date de début doit être antérieure ou égale à la date de fin');
  }
  return {
    ...(from ? { gte: parisDayStartUtc(from) } : {}),
    ...(to ? { lt: parisDayStartUtc(nextIsoDay(to)) } : {}),
  };
}

function nextIsoDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const parisDateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Horodatage lisible à l'heure de Paris (« 2026-09-24 14:05:09 ») pour l'export. */
export function formatParisDateTime(instant: Date): string {
  return parisDateTimeFormatter.format(instant);
}
