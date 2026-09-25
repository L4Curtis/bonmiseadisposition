import { BadRequestException } from '@nestjs/common';
import { addDaysToIsoDate, isRealCalendarDate, parisDayStartUtc } from '../common/dates/paris';

function parseBound(value: string, name: string): string {
  if (!isRealCalendarDate(value)) {
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
    ...(to ? { lt: parisDayStartUtc(addDaysToIsoDate(to, 1)) } : {}),
  };
}
