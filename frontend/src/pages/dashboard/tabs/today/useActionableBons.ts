import { useApiResource } from '@/hooks/use-api-resource';

const MAX_ROWS_PER_CATEGORY = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Bon tel que renvoyé par les routes de liste existantes (`/bons?...`) —
 *  seuls les champs utilisés par le bloc « À traiter aujourd'hui » sont
 *  déclarés ici (même logique que `RecentBon` dans TodayTab.tsx : chaque
 *  consommateur de l'API déclare le sous-ensemble dont il a besoin). */
interface ActionableBonApi {
  id: string;
  reference: string;
  collaborateur: { displayName: string };
  createdAt: string;
  updatedAt: string;
  dateRestitution: string | null;
}

interface BonsListResponse {
  bons: ActionableBonApi[];
  total: number;
}

export interface ActionableBonRow {
  id: string;
  reference: string;
  collaborateurName: string;
  /** Ancienneté en jours de la date qui définit le retard de cette catégorie
   *  (création pour un brouillon, dernière mise à jour pour une signature en
   *  attente, date de restitution prévue pour une restitution en retard). */
  daysAgo: number;
}

export interface ActionableCategory {
  rows: ActionableBonRow[];
  /** Nombre total de bons concernés (peut dépasser `rows.length`, limité aux
   *  premières lignes affichées). Plafonné aux 100 bons ramenés par l'appel
   *  (maximum autorisé par l'API) pour la restitution en retard, faute de
   *  filtre dédié côté backend — approximation acceptée pour un aperçu. */
  total: number;
  loading: boolean;
}

export interface ActionableBonsState {
  drafts: ActionableCategory;
  overdueSignatures: ActionableCategory;
  overdueReturns: ActionableCategory;
  loading: boolean;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY));
}

function toRow(bon: ActionableBonApi, referenceDate: string): ActionableBonRow {
  return {
    id: bon.id,
    reference: bon.reference,
    collaborateurName: bon.collaborateur.displayName,
    daysAgo: daysSince(referenceDate),
  };
}

/** Regroupe les trois familles de bons « à traiter » du bloc actionnable de
 *  l'onglet Aujourd'hui (lot E1). Réutilise les routes de liste existantes
 *  (`/bons?status=…`, `/bons?overdue=1`) — aucune route dédiée n'est créée :
 *  le tri « plus ancien d'abord » et le filtre de restitution en retard sont
 *  faits côté client sur la page ramenée (jusqu'à 100 bons, le maximum
 *  autorisé par l'API), largement suffisant pour un aperçu de quelques
 *  lignes. Une erreur de chargement sur une catégorie la traite comme vide
 *  plutôt que d'ajouter un troisième bandeau d'erreur à cet onglet (même
 *  parti pris que la tuile « Départs avec matériel »). */
export function useActionableBons(): ActionableBonsState {
  const draftsRes = useApiResource<BonsListResponse>(
    '/bons?status=draft&limit=100',
    'Erreur lors du chargement des brouillons',
  );
  const overdueRes = useApiResource<BonsListResponse>(
    '/bons?overdue=1&limit=100',
    'Erreur lors du chargement des signatures en retard',
  );
  const activeRes = useApiResource<BonsListResponse>(
    '/bons?status=active&limit=100',
    'Erreur lors du chargement des bons actifs',
  );

  const draftBons = draftsRes.data?.bons ?? [];
  const drafts: ActionableCategory = {
    total: draftsRes.error ? 0 : draftsRes.data?.total ?? 0,
    loading: draftsRes.loading,
    rows: draftBons
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, MAX_ROWS_PER_CATEGORY)
      .map((b) => toRow(b, b.createdAt)),
  };

  const overdueBons = overdueRes.data?.bons ?? [];
  const overdueSignatures: ActionableCategory = {
    total: overdueRes.error ? 0 : overdueRes.data?.total ?? 0,
    loading: overdueRes.loading,
    rows: overdueBons
      .slice()
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, MAX_ROWS_PER_CATEGORY)
      .map((b) => toRow(b, b.updatedAt)),
  };

  const now = Date.now();
  const returnOverdueBons = (activeRes.error ? [] : activeRes.data?.bons ?? [])
    .filter((b): b is ActionableBonApi & { dateRestitution: string } =>
      !!b.dateRestitution && new Date(b.dateRestitution).getTime() < now);
  const overdueReturns: ActionableCategory = {
    total: returnOverdueBons.length,
    loading: activeRes.loading,
    rows: returnOverdueBons
      .slice()
      .sort((a, b) => new Date(a.dateRestitution).getTime() - new Date(b.dateRestitution).getTime())
      .slice(0, MAX_ROWS_PER_CATEGORY)
      .map((b) => toRow(b, b.dateRestitution)),
  };

  return {
    drafts,
    overdueSignatures,
    overdueReturns,
    loading: draftsRes.loading || overdueRes.loading || activeRes.loading,
  };
}
