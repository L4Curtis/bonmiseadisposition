import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';

export type ScheduledJobRunStatus = 'success' | 'error' | 'skipped';

export interface ScheduledJobStatusEntry {
  job: string;
  label: string;
  schedule: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: ScheduledJobRunStatus | null;
  lastError: string | null;
  lastDurationMs: number | null;
  late: boolean;
}

export interface AdminStatus {
  version: string;
  commit: string;
  uptimeSeconds: number;
  database: 'ok' | 'unreachable';
  jobs: ScheduledJobStatusEntry[];
}

type PillState = 'ok' | 'error' | 'late' | 'disabled' | 'unknown';

/** Priorité d'affichage quand plusieurs conditions se recoupent : une erreur
 *  prime toujours, puis un retard, puis l'état désactivé (skipped), sinon OK. */
function pillState(entry: ScheduledJobStatusEntry): PillState {
  if (entry.lastStatus === 'error') return 'error';
  if (entry.late) return 'late';
  if (entry.lastStatus === 'skipped') return 'disabled';
  if (entry.lastStatus === 'success') return 'ok';
  return 'unknown';
}

// Uniquement les jetons du thème (--success, --warning, --destructive,
// text-muted-foreground) — jamais de couleur de palette (règle en tête de
// frontend/src/index.css).
const PILL_META: Record<PillState, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-success' },
  error: { label: 'Erreur', className: 'text-destructive' },
  late: { label: 'En retard', className: 'text-warning' },
  disabled: { label: 'Désactivée', className: 'text-muted-foreground' },
  unknown: { label: 'Aucune exécution', className: 'text-muted-foreground' },
};

function StatusPill({ entry }: { entry: ScheduledJobStatusEntry }) {
  const meta = PILL_META[pillState(entry)];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Date relative courte (« il y a 3 h ») — pas de dépendance externe pour un
 *  seul usage. */
function formatRelative(iso: string | null): string {
  if (!iso) return 'jamais';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MINUTE_MS) return "à l'instant";
  if (diffMs < HOUR_MS) return `il y a ${Math.floor(diffMs / MINUTE_MS)} min`;
  if (diffMs < DAY_MS) return `il y a ${Math.floor(diffMs / HOUR_MS)} h`;
  return `il y a ${Math.floor(diffMs / DAY_MS)} j`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Carte « Tâches planifiées » — une ligne par tâche (@Cron) avec son dernier
 * passage, sa durée et son état, plus version/commit déployés en pied de
 * carte. Alimentée par GET /admin/status (lot A5, supervision).
 */
export function ScheduledJobsCard() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<AdminStatus>('/admin/status')
      .then(setStatus)
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement des tâches planifiées')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tâches planifiées</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            aria-label="Actualiser les tâches planifiées"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(status?.jobs ?? []).map((entry) => (
                <li key={entry.job} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{entry.label}</span>
                      <span className="text-xs text-muted-foreground">{entry.schedule}</span>
                    </div>
                    {entry.lastStatus === 'error' && entry.lastError && (
                      <p className="truncate text-xs text-destructive" title={entry.lastError}>{entry.lastError}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                    <div>{formatRelative(entry.lastFinishedAt)}</div>
                    <div>{formatDuration(entry.lastDurationMs)}</div>
                  </div>
                  <div className="shrink-0">
                    <StatusPill entry={entry} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Version {status?.version ?? 'dev'} · commit {status?.commit ?? 'dev'}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
