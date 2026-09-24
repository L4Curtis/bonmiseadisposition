import {
  DEFAULT_LIST_QUERY,
  toRememberedParams,
  type BonsListQuery,
} from './bonsListQuery';
import { IN_PROGRESS_EXCLUDE, WAITING_ALL_STATUS } from './statusFilterOptions';

/** Vue rapide : un jeu de filtres et un tri prêts à l'emploi, qui REMPLACE les
 *  filtres en cours (pas de cumul, pour que le résultat soit prévisible). */
export interface QuickView {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly query: BonsListQuery;
}

function view(patch: Partial<BonsListQuery>): BonsListQuery {
  return { ...DEFAULT_LIST_QUERY, ...patch };
}

/** Vues rapides de la liste. « Mes brouillons » dépend de l'utilisateur
 *  connecté, d'où la fabrique ; sans utilisateur connu, elle est omise. */
export function buildQuickViews(currentUserId: string | undefined): QuickView[] {
  const views: QuickView[] = [];
  if (currentUserId) {
    views.push({
      id: 'my-drafts',
      label: 'Mes brouillons',
      description: 'Brouillons que vous avez créés, les plus anciens d’abord',
      query: view({ status: 'draft', createdById: currentUserId, sort: 'createdAt', order: 'asc' }),
    });
  }
  views.push(
    {
      id: 'overdue',
      label: 'En retard',
      description: 'Signatures en attente depuis plus longtemps que le seuil de retard',
      query: view({ overdue: true, sort: 'updatedAt', order: 'asc' }),
    },
    {
      id: 'to-remind',
      label: 'À relancer',
      description: 'Bons en attente de signature, dernière activité la plus ancienne d’abord',
      query: view({ status: WAITING_ALL_STATUS, sort: 'updatedAt', order: 'asc' }),
    },
    {
      id: 'no-return-date',
      label: 'Sans date de restitution',
      description: 'Bons en cours sans date de restitution prévue',
      query: view({ excludeStatus: IN_PROGRESS_EXCLUDE, noReturnDate: true }),
    },
  );
  return views;
}

/** Vue rapide correspondant exactement à l'état courant (filtres et tri,
 *  page ignorée), pour la signaler comme active. */
export function findActiveView(views: readonly QuickView[], q: BonsListQuery): QuickView | undefined {
  const current = toRememberedParams(q).toString();
  return views.find((v) => toRememberedParams(v.query).toString() === current);
}
