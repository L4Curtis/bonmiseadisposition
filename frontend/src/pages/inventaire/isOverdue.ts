import { daysOverdue } from './dateMetrics';

/** Un équipement est en retard quand sa date de restitution prévue est passée
 *  (comparaison sur la date seule, fuseau Paris — cf. dateMetrics.daysSince). */
export function isOverdue(dateRestitution: string | null): boolean {
  return daysOverdue(dateRestitution) !== null;
}
