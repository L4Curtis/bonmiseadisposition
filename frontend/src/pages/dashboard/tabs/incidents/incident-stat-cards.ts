import { AlertTriangle, Ban, FileWarning, MessageSquareWarning, Search, XCircle } from 'lucide-react';
import type { StatCardProps } from '@/components/dashboard/StatCard';
import type { IncidentsKpiResponse } from '../../types/incidents';

export interface IncidentStatCardConfig {
  key: string;
  props: StatCardProps;
  /** Texte additionnel affiché sous la tuile (ex. « 1 en cours ») — distinct
   *  du delta, qui occupe déjà cet emplacement dans `StatCard`. */
  footer?: string;
}

/** Construit les 6 tuiles de la rangée supérieure de l'onglet Incidents.
 *  `data` est `null` pendant le chargement : chaque valeur retombe alors sur
 *  `null`/`undefined`, et `loading` pilote l'affichage du skeleton via
 *  `StatCard` (aucun rendu conditionnel supplémentaire n'est nécessaire côté
 *  appelant). */
export function buildIncidentStatCards(
  data: IncidentsKpiResponse | null,
  loading: boolean,
): IncidentStatCardConfig[] {
  return [
    {
      key: 'not-returned-declared',
      props: {
        label: 'Non restitués déclarés',
        value: data?.notReturned.declared.current ?? null,
        icon: AlertTriangle,
        loading,
        delta: data
          ? { current: data.notReturned.declared.current, previous: data.notReturned.declared.previous, invert: true }
          : undefined,
      },
    },
    {
      key: 'not-returned-found',
      props: {
        label: 'Retrouvés',
        value: data?.notReturned.found.current ?? null,
        icon: Search,
        loading,
        delta: data
          ? { current: data.notReturned.found.current, previous: data.notReturned.found.previous }
          : undefined,
      },
    },
    {
      key: 'pv-cloture',
      props: {
        label: 'PV de non-restitution émis',
        value: data?.pvCloture.emitted.current ?? null,
        icon: FileWarning,
        loading,
        delta: data
          ? { current: data.pvCloture.emitted.current, previous: data.pvCloture.emitted.previous, invert: true }
          : undefined,
      },
    },
    {
      key: 'unilateral-closures',
      props: {
        label: 'Clôtures unilatérales',
        value: data?.unilateralClosures.count.current ?? null,
        icon: Ban,
        loading,
        delta: data
          ? { current: data.unilateralClosures.count.current, previous: data.unilateralClosures.count.previous, invert: true }
          : undefined,
      },
    },
    {
      key: 'cancellations',
      props: {
        label: 'Annulations',
        value: data?.cancellations.count.current ?? null,
        icon: XCircle,
        loading,
        delta: data
          ? { current: data.cancellations.count.current, previous: data.cancellations.count.previous, invert: true }
          : undefined,
      },
    },
    {
      key: 'contestations-opened',
      props: {
        label: 'Contestations ouvertes',
        value: data?.contestations.opened.current ?? null,
        icon: MessageSquareWarning,
        loading,
        delta: data
          ? { current: data.contestations.opened.current, previous: data.contestations.opened.previous, invert: true }
          : undefined,
      },
      footer: data ? `${data.contestations.openNow} en cours` : undefined,
    },
  ];
}
