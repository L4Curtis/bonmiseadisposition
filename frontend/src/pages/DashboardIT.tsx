import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, Clock, CheckCircle, AlertTriangle, Plus,
  Building2, CalendarDays, ArrowRight, Archive, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { type BonStatus } from '@/types';
import { isWaitingStatus, type SignatureSummary } from '@/lib/bon-helpers';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
  partiallyReturned: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(bon: RecentBon) {
  if (!isWaitingStatus(bon.status)) return false;
  return new Date(bon.updatedAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// ─── Skeleton Components ──────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="relative rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

function RecentListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full ml-auto" />
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
        <div key={i} className="px-5 py-3.5 space-y-2.5">
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  onClick: () => void;
  className?: string;
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, onClick, className }: StatCardProps) {
  return (
    <button
      className={`group w-full text-left rounded-xl border border-border/80 bg-card p-5 card-elevated hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 ${className ?? ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground leading-none mb-3 truncate">{label}</p>
          <p className="text-[28px] font-semibold tracking-tighter text-foreground tabular-nums leading-none">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06] shrink-0 transition-transform duration-200 group-hover:scale-105`}>
          <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/0 group-hover:text-muted-foreground/80 transition-colors duration-200">
        Voir le détail
        <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200" />
      </div>
    </button>
  );
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function DashboardIT() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentBon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Stats>('/bons/stats'),
      api.get<RecentBon[]>('/bons/recent?limit=10'),
    ]).then(([s, r]) => {
      setStats(s);
      setRecent(r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statCards: StatCardProps[] = useMemo(() => [
    {
      label: 'Total bons en cours',
      value: stats?.total ?? 0,
      icon: FileText,
      iconBg: 'bg-[hsl(var(--primary)/0.10)] dark:bg-[hsl(var(--primary)/0.15)]',
      iconColor: 'text-[hsl(var(--primary))]',
      onClick: () => navigate('/bons?excludeStatus=cancelled,archived'),
    },
    {
      label: 'En attente de signature',
      value: stats?.waitingSignature ?? 0,
      icon: Clock,
      iconBg: 'bg-amber-100 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      onClick: () => navigate('/bons?status=sent_mise_dispo,sent_restitution,partially_returned'),
    },
    {
      label: 'Bons actifs',
      value: stats?.active ?? 0,
      icon: CheckCircle,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => navigate('/bons?status=active'),
    },
    {
      label: 'Restitution partielle',
      value: stats?.partiallyReturned ?? 0,
      icon: RotateCcw,
      iconBg: 'bg-blue-100 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      onClick: () => navigate('/bons?status=partially_returned'),
    },
    {
      label: 'Archivés ce mois',
      value: stats?.archivedThisMonth ?? 0,
      icon: Archive,
      iconBg: 'bg-violet-100 dark:bg-violet-900/20',
      iconColor: 'text-violet-600 dark:text-violet-400',
      onClick: () => navigate('/bons?status=archived'),
    },
    {
      label: 'En retard (> 7 j)',
      value: stats?.overdue ?? 0,
      icon: AlertTriangle,
      iconBg: 'bg-red-100 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      onClick: () => navigate('/bons'),
    },
  ], [stats, navigate]);

  const maxFiliale = stats?.byFiliale?.length
    ? Math.max(...stats.byFiliale.map((f) => f.count), 1)
    : 1;

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-tight">Tableau de bord</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vue d&apos;ensemble de l&apos;activité du parc</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/70 border border-border rounded-lg px-3 py-2 bg-card">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
          <Button onClick={() => navigate('/bons/new')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau bon
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map((card, index) => <StatCard key={card.label} {...card} className={`animate-fade-in-up-${index + 1}`} />)
        }
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Bons récents – spans 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card card-elevated overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">Bons récents</h3>
            <button
              onClick={() => navigate('/bons')}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Voir tout
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <RecentListSkeleton />
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
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
                const late = isOverdue(bon);
                return (
                  <button
                    key={bon.id}
                    className="group w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => navigate(`/bons/${bon.id}`)}
                  >
                    <span className="shrink-0 font-mono text-xs font-semibold text-foreground/80 bg-muted group-hover:bg-muted rounded px-2 py-1 transition-colors">
                      {bon.reference}
                    </span>

                    <span className="flex-1 min-w-0 text-sm text-foreground/80 truncate">
                      {bon.collaborateur.displayName}
                    </span>

                    <span className="shrink-0">
                      <StatusBadge status={bon.status} signatures={bon.signatures} />
                    </span>

                    {late && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
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
        <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Building2 className="h-4 w-4 text-muted-foreground/70" />
            <h3 className="text-sm font-semibold text-foreground">Bons actifs par filiale</h3>
          </div>

          {loading ? (
            <FilialeSkeleton />
          ) : !stats?.byFiliale?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/70 mb-2" />
              <p className="text-xs text-muted-foreground/70">Aucune donnée disponible</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.byFiliale.map((f) => {
                const pct = Math.round((f.count / maxFiliale) * 100);
                return (
                  <button
                    key={f.id}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/bons?filialeId=${f.id}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-foreground/80 font-medium truncate pr-2">{f.name}</span>
                      <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground/80 min-w-[2rem]">
                        {f.count}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: 'var(--gradient-primary)' }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
