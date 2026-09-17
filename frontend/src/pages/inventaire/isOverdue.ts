import { todayInParis } from '@/lib/kpi-period';

/** Un équipement est en retard quand sa date de restitution prévue est passée
 *  (comparaison sur la date seule, fuseau Paris — cf. todayInParis). */
export function isOverdue(dateRestitution: string | null): boolean {
  if (!dateRestitution) return false;
  return dateRestitution.slice(0, 10) < todayInParis();
}
