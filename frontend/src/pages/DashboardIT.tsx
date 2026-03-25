import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, Clock, CheckCircle, AlertTriangle, Plus,
  Building2, CalendarDays, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(bon: RecentBon) {
  if (!['sent_mise_dispo', 'sent_restitution'].includes(bon.status)) return false;
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
      className={`group w-full text-left rounded-xl border border-border bg-card p-5 card-elevated hover:shadow-card-hover hover:border-primary/25 transition-all duration-150 ${className ?? ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground leading-none mb-3">{label}</p>
          <p className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg} shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
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
      onClick: () => navigate('/bons'),
    },
    {
      label: 'En attente de signature',
      value: stats?.waitingSignature ?? 0,
      icon: Clock,
      iconBg: 'bg-amber-100 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      onClick: () => navigate('/bons?status=sent_mise_dispo'),
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
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Tableau de bord</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vue d&apos;ensemble de l&apos;activité</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
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
                    {/* Reference badge */}
                    <span className="shrink-0 font-mono text-xs font-semibold text-foreground/80 bg-muted group-hover:bg-muted rounded px-2 py-1 transition-colors">
                      {bon.reference}
                    </span>

                    {/* Collaborateur */}
                    <span className="flex-1 min-w-0 text-sm text-foreground/80 truncate">
                      {bon.collaborateur.displayName}
                    </span>

                    {/* Status badge */}
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}>
                      {BON_STATUS_LABELS[bon.status]}
                    </span>

                    {/* Overdue indicator */}
                    {late && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        En retard
                      </span>
                    )}

                    {/* Date */}
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
                    <div className="w-full bg-muted rounded-full h-1">
                      <div
                        className="bg-[hsl(var(--primary))] h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
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
