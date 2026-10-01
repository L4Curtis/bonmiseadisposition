import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, HardDrive, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { formatDateTime } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { FailedEmailsCard } from '@/components/admin/FailedEmailsCard';
import type {
  SmbFailedExport,
  SmbRetryAllResponse,
  SmbRetryOneResponse,
  SmbStatusEnabled,
  SmbStatusResponse,
} from '@/contracts/admin';
import { ScheduledJobsCard } from './ScheduledJobsCard';
import { SmbFailedExports } from './SmbFailedExports';

const CARD_TITLE = 'Surveillance de la copie réseau des PDF';

function SmbCounters({ status }: { status: SmbStatusEnabled }) {
  const hasFailures = status.failed > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className={`flex items-center gap-1.5 font-medium ${hasFailures ? 'text-destructive' : 'text-success'}`}>
        {hasFailures ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        {hasFailures ? `${status.failed} copie(s) en échec` : 'Toutes les copies ont réussi'}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>Total : <strong className="text-foreground">{status.total}</strong></span>
        <span>Réussies : <strong className="text-success">{status.success}</strong></span>
        <span>En échec : <strong className={hasFailures ? 'text-destructive' : 'text-foreground'}>{status.failed}</strong></span>
        <span>En attente : <strong className="text-foreground">{status.pending}</strong></span>
      </div>
    </div>
  );
}

/**
 * Supervision : tâches planifiées, copie des PDF sur le partage réseau (SMB)
 * et emails en échec. Une relance qui échoue le dit, avec sa cause.
 */
export function ConfigMonitoringPage() {
  const [status, setStatus] = useState<SmbStatusResponse | null>(null);
  const [failed, setFailed] = useState<SmbFailedExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<SmbStatusResponse>('/admin/smb/status');
      setStatus(s);
      setFailed(s.enabled && s.failed > 0 ? (await api.getList<SmbFailedExport>('/admin/smb/failed')).items : []);
    } catch (e: unknown) {
      setStatus(null);
      showActionError(e, 'Erreur lors du chargement de la copie réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const retryOne = async (exp: SmbFailedExport) => {
    setRetrying(exp.id);
    try {
      const result = await api.post<SmbRetryOneResponse>(`/admin/smb/retry/${exp.id}`);
      toast({
        title: result.ok ? 'Copie relancée' : 'La relance a échoué',
        description: result.message,
        variant: result.ok ? 'success' : 'destructive',
      });
      await load();
    } catch (e: unknown) {
      showActionError(e, 'La relance a échoué');
    } finally {
      setRetrying(null);
    }
  };

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      const result = await api.post<SmbRetryAllResponse>('/admin/smb/retry-all');
      toast({
        title: `Relance terminée : ${result.succeeded} réussie(s), ${result.failed} en échec`,
        variant: result.failed > 0 ? 'destructive' : 'success',
      });
      await load();
    } catch (e: unknown) {
      showActionError(e, 'La relance a échoué');
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Configuration — Monitoring SMB</h1>
      <ScheduledJobsCard />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> {CARD_TITLE}</CardTitle>
            {status?.enabled && (
              <Button variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={load} aria-label="Actualiser l’état de la copie réseau">
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : !status || !status.enabled ? (
            <p className="text-sm text-muted-foreground">
              La copie des PDF sur le partage réseau est désactivée. Activez-la dans la rubrique « Export SMB » pour en suivre l’état.
            </p>
          ) : (
            <>
              <SmbCounters status={status} />
              {status.lastSuccessAt && (
                <p className="text-xs text-muted-foreground">Dernière copie réussie : {formatDateTime(status.lastSuccessAt)}</p>
              )}
              {failed.length > 0 && (
                <SmbFailedExports exports={failed} retrying={retrying} retryingAll={retryingAll} onRetry={retryOne} onRetryAll={retryAll} />
              )}
            </>
          )}
        </CardContent>
      </Card>
      <FailedEmailsCard />
    </div>
  );
}
