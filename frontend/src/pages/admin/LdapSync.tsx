import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';

interface SyncStatus {
  lastSync: string | null;
  lastSyncSuccess: boolean | null;
  lastSyncCount: number | null;
  lastSyncError: string | null;
}

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_INTERVAL_HOURS = 6;

export function LdapSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState<number | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const fetchStatus = async (): Promise<SyncStatus | null> => {
    try {
      const data = await api.get<SyncStatus>('/admin/ldap/status');
      setStatus(data);
      setLoadError(null);
      return data;
    } catch (e: unknown) {
      setLoadError(errorMessage(e, 'Erreur lors du chargement du statut de synchronisation'));
      return null;
    }
  };

  const loadInitial = async () => {
    setLoadingStatus(true);
    await fetchStatus();
    setLoadingStatus(false);
  };

  useEffect(() => {
    loadInitial();
    api.get<Record<string, string>>('/admin/config/ldap')
      .then((data) => {
        const n = Number(data.sync_interval_hours);
        setSyncIntervalHours(Number.isFinite(n) && n > 0 ? n : null);
      })
      .catch(() => { /* non bloquant — on affiche une valeur par défaut */ });
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollUntilSynced = (previousLastSync: string | null) => {
    stopPolling();
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(async () => {
      const data = await fetchStatus();
      const changed = !!data && data.lastSync !== previousLastSync;
      const timedOut = Date.now() - startedAt > POLL_MAX_MS;
      if (changed || timedOut) {
        stopPolling();
        setSyncing(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const triggerSync = async () => {
    setSyncing(true);
    const previousLastSync = status?.lastSync ?? null;
    try {
      await api.post('/admin/ldap/sync');
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du déclenchement de la synchronisation');
      setSyncing(false);
      return;
    }
    pollUntilSynced(previousLastSync);
  };

  const purgeUsers = async () => {
    setPurgeDialogOpen(false);
    setPurging(true);
    try {
      const res = await api.delete<{ message?: string; deactivated?: number }>('/admin/ldap/users');
      toast({
        title: typeof res.deactivated === 'number'
          ? `${res.deactivated} compte(s) collaborateur désactivé(s)`
          : (res.message ?? 'Comptes LDAP désactivés'),
        variant: 'success',
      });
      await fetchStatus();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la désactivation des comptes LDAP');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Synchronisation LDAP</h1>

      <Card>
        <CardHeader>
          <CardTitle>Statut de la synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingStatus ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
            </div>
          ) : loadError && !status ? (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4 text-center" role="alert">
              <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadInitial}>
                Réessayer
              </Button>
            </div>
          ) : status ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-40">Derniere sync :</span>
                <span className="text-sm font-medium">
                  {status.lastSync
                    ? formatDateTime(status.lastSync)
                    : 'Jamais'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-40">Resultat :</span>
                {status.lastSyncSuccess === null ? (
                  <Badge variant="outline">En attente</Badge>
                ) : status.lastSyncSuccess ? (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Succes ({status.lastSyncCount} utilisateurs)
                  </Badge>
                ) : (
                  <Badge variant="error" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Echec
                  </Badge>
                )}
              </div>
              {status.lastSyncError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-3" role="alert">
                  <p className="text-sm text-red-700 dark:text-red-400 font-mono">{status.lastSyncError}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground/70">
                <Clock className="h-3 w-3" />
                Sync automatique toutes les {syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS} heures
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={triggerSync} disabled={syncing || loadingStatus} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              {syncing ? 'Synchronisation en cours...' : 'Lancer une sync manuelle'}
            </Button>
            <Button
              onClick={() => setPurgeDialogOpen(true)}
              disabled={purging}
              variant="destructive"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {purging ? 'Désactivation...' : 'Désactiver les comptes LDAP'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver les comptes LDAP</DialogTitle>
            <DialogDescription>
              Les comptes <strong>collaborateurs</strong> synchronisés depuis l&apos;Active Directory seront{' '}
              <strong>désactivés</strong> (pas supprimés). Les comptes admin et technicien, ainsi que votre
              propre compte, sont exclus et ne seront jamais désactivés par cette action.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={purgeUsers}>
              Désactiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
