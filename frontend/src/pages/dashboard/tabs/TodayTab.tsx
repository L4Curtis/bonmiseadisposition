import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Clock, CheckCircle, AlertTriangle, Plus,
  Building2, ArrowRight, Archive, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { StatCard, StatCardSkeleton, type StatCardProps } from '@/components/dashboard/StatCard';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { useApiResource } from '@/hooks/use-api-resource';
import { formatDate } from '@/lib/utils';
import { isWaitingStatus, type SignatureSummary } from '@/lib/bon-helpers';
import type { BonStatus } from '@/types';

const DEFAULT_OVERDUE_THRESHOLD_DAYS = 7;

interface Stats {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
  partiallyReturned: number;
  /** Ajouté par le backend (lot 1) ; 7 par défaut en attendant. */
  overdueThresholdDays?: number;
  byFiliale: { id: string; name: string; count: number }[];
}

interface RecentBon {
  id: string;
  reference: string;
  status: BonStatus;
  dateMiseDisposition: string;
  updatedAt: string;
  collaborateur: { displayName: string; email: string };
  filiale: { displayName: string };
  signatures: SignatureSummary[];
}

function isOverdue(bon: RecentBon, thresholdDays: number): boolean {
  if (!isWaitingStatus(bon.status)) return false;
  return new Date(bon.updatedAt) < new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
}

function RecentListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function FilialeSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2.5 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Onglet « Aujourd'hui » — contenu de l'ex-DashboardIT.tsx, déplacé tel quel
 *  mais avec deux `useApiResource` indépendants : les tuiles et la liste des
 *  bons récents ont chacune leur propre chargement/erreur. */
export function TodayTab() {
  const navigate = useNavigate();

  const { data: stats, loading: statsLoading, error: statsError, reload: reloadStats } =
    useApiResource<Stats>('/bons/stats', 'Erreur lors du chargement des statistiques');
  const { data: recent, loading: recentLoading, error: recentError, reload: reloadRecent } =
    useApiResource<RecentBon[]>('/bons/recent?limit=10', 'Erreur lors du chargement des bons récents');

  const thresholdDays = stats?.overdueThresholdDays ?? DEFAULT_OVERDUE_THRESHOLD_DAYS;

  const statCards: Array<StatCardProps & { key: string }> = useMemo(() => [
    {
      key: 'total',
      label: 'Total bons en cours',
      value: stats?.total ?? null,
      icon: FileText,
      onClick: () => navigate('/bons?excludeStatus=cancelled,archived'),
    },
    {
      key: 'waiting',
      label: 'En attente de signature',
      value: stats?.waitingSignature ?? null,
      icon: Clock,
      onClick: () => navigate('/bons?status=sent_mise_dispo,sent_restitution,partially_returned'),
    },
    {
      key: 'active',
      label: 'Bons actifs',
      value: stats?.active ?? null,
      icon: CheckCircle,
      onClick: () => navigate('/bons?status=active'),
    },
    {
      key: 'partial',
      label: 'Restitution partielle',
      value: stats?.partiallyReturned ?? null,
      icon: RotateCcw,
      onClick: () => navigate('/bons?status=partially_returned'),
    },
    {
      key: 'archived',
      label: 'Archivés ce mois',
      value: stats?.archivedThisMonth ?? null,
      icon: Archive,
      onClick: () => navigate('/bons?status=archived'),
    },
    {
      key: 'overdue',
      label: `En retard (> ${thresholdDays} j)`,
      value: stats?.overdue ?? null,
      icon: AlertTriangle,
      tone: 'danger',
      onClick: () => navigate('/bons?overdue=1'),
    },
  ], [stats, thresholdDays, navigate]);

  const breakdownRows = (stats?.byFiliale ?? []).map((f) => ({
    key: f.id,
    label: f.name,
    count: f.count,
    onClick: () => navigate(`/bons?filialeId=${f.id}`),
  }));

  return (
    <div className="space-y-6">
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : statsError ? (
          <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{statsError}</p>
            <Button type="button" variant="outline" size="sm" onClick={reloadStats}>Réessayer</Button>
          </div>
        ) : (
          statCards.map((card, index) => {
            const { key, ...cardProps } = card;
            return <StatCard key={key} {...cardProps} className={`animate-fade-in-up-${index + 1}`} />;
          })
        )}
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Bons récents – spans 2/3 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">Bons récents</h3>
            <button
              onClick={() => navigate('/bons')}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Voir tout
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentLoading ? (
            <RecentListSkeleton />
          ) : recentError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <p className="mb-1 text-sm font-medium text-foreground/80">Erreur de chargement</p>
              <p className="max-w-xs text-xs text-muted-foreground/70">{recentError}</p>
              <Button variant="outline" size="sm" onClick={reloadRecent} className="mt-4">
                Réessayer
              </Button>
            </div>
          ) : !recent || recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground/70" />
              </div>
              <p className="text-sm font-medium text-foreground/80">Aucun bon créé pour l&apos;instant</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Commencez par créer un premier bon de mise à disposition.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/bons/new')} className="mt-4 gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Créer un bon
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((bon) => {
                const late = isOverdue(bon, thresholdDays);
                return (
                  <button
                    key={bon.id}
                    className="group flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                    onClick={() => navigate(`/bons/${bon.id}`)}
                  >
                    <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs font-semibold text-foreground/80 transition-colors group-hover:bg-muted">
                      {bon.reference}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                      {bon.collaborateur.displayName}
                    </span>

                    <span className="shrink-0">
                      <StatusBadge status={bon.status} signatures={bon.signatures} />
                    </span>

                    {late && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        En retard
                      </span>
                    )}

                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      {formatDate(bon.dateMiseDisposition)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Par filiale – spans 1/3 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Building2 className="h-4 w-4 text-muted-foreground/70" />
            <h3 className="text-sm font-semibold text-foreground">Bons actifs par filiale</h3>
          </div>

          {statsLoading ? (
            <FilialeSkeleton />
          ) : statsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="mb-2 h-8 w-8 text-muted-foreground/70" />
              <p className="text-xs text-muted-foreground/70">Données indisponibles</p>
            </div>
          ) : (
            <BreakdownBars rows={breakdownRows} />
          )}
        </div>

      </div>
    </div>
  );
}
