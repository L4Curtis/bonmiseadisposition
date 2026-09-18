import type { Pack } from '../types';

/** Filtre d'état partagé par le catalogue et les packs : par défaut, seuls
 *  les éléments actifs sont visibles (les désactivés n'ont d'intérêt que
 *  ponctuellement, ex. pour les réactiver). */
export type ItemStatusFilter = 'active' | 'all' | 'inactive';

export const STATUS_FILTER_OPTIONS: { value: ItemStatusFilter; label: string }[] = [
  { value: 'active', label: 'Actifs' },
  { value: 'all', label: 'Tous' },
  { value: 'inactive', label: 'Désactivés' },
];

/** Un élément (équipement ou pack) correspond-il au filtre d'état sélectionné ? */
export function matchesStatusFilter(active: boolean, status: ItemStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'active' ? active : !active;
}

/** Filtre les packs par état — même logique que le catalogue, appliquée à
 *  {@link Pack.active}. Le volume de packs est faible : filtrage entièrement
 *  côté client, comme le reste du catalogue. */
export function filterPacksByStatus(packs: Pack[], status: ItemStatusFilter): Pack[] {
  return packs.filter((pack) => matchesStatusFilter(pack.active, status));
}
