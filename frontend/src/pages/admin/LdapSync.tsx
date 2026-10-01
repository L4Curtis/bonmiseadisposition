import { useEffect, useRef, useState } from 'react';
import { RefreshCw, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { SCREEN_LABELS } from '@/domain/labels';
import type { LdapDeactivateAllResponse, LdapSyncStatusResponse, LdapSyncTriggerResponse } from '@/contracts/admin';
import { useConfigRegistry } from './configuration/useConfigRegistry';
import { LdapStatusDetails } from './ldap/LdapStatusDetails';

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 5 * 60 * 1000;

/** Message de fin d'une synchronisation lancée à la main, d'après l'état rapporté. */
function announceResult(status: LdapSyncStatusResponse): void {
  if (status.lastSyncSuccess === false) {
    toast({ title: 'La synchronisation a échoué', description: status.lastSyncError ?? undefined, variant: 'destructive' });
  } else if (status.lastSyncAborted) {
    toast({ title: 'Synchronisation partielle', description: status.lastSyncWarning ?? undefined, variant: 'destructive' });
  } else {
    toast({ title: `Synchronisation terminée : ${status.lastSyncCount ?? 0} compte(s) lus`, variant: 'success' });
  }
}

/**
 * Synchronisation de l'annuaire (Active Directory) : état de la dernière
 * synchronisation, lancement manuel (suivi jusqu'à son résultat) et
 * désactivation en masse des comptes de l'annuaire.
 */
export function LdapSyncPage() {
  const [status, setStatus] = useState<LdapSyncStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const registry = useConfigRegistry('ldap');
  const interval = registry.entries.sync_interval_hours?.appliedValue;
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  const fetchStatus = async (): Promise<LdapSyncStatusResponse | null> => {
    try {
      const data = await api.get<LdapSyncStatusResponse>('/admin/ldap/status');
      setStatus(data);
      setLoadError(null);
      return data;
    } catch (e: unknown) {
      setLoadError(errorMessage(e, 'Erreur lors du chargement de l’état de la synchronisation'));
      return null;
    }
  };

  const loadInitial = async () => {
    setLoadingStatus(true);
    await fetchStatus();
    setLoadingStatus(false);
  };

  useEffect(() => {
    void loadInitial();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial unique ; l'arrêt au démontage ne dépend que d'une référence.
  }, []);

  const pollUntilSynced = (previousLastSync: string | null) => {
    stopPolling();
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(async () => {
      const data = await fetchStatus();
      const finished = !!data && data.lastSync !== previousLastSync;
      if (finished || Date.now() - startedAt > POLL_MAX_MS) {
        stopPolling();
        setSyncing(false);
        if (finished && data) announceResult(data);
      }
    }, POLL_INTERVAL_MS);
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post<LdapSyncTriggerResponse>('/admin/ldap/sync');
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du lancement de la synchronisation');
      setSyncing(false);
      return;
    }
    pollUntilSynced(status?.lastSync ?? null);
  };

  const deactivateAll = async () => {
    setConfirmOpen(false);
    setDeactivating(true);
    try {
      const res = await api.post<LdapDeactivateAllResponse>('/admin/ldap/deactivate-all');
      toast({ title: res.message, variant: 'success' });
      await fetchStatus();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la désactivation des comptes de l’annuaire');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">{SCREEN_LABELS.annuaire}</h1>
      <Card>
        <CardHeader><CardTitle>État de la synchronisation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loadingStatus ? (
            <div className="space-y-3"><Skeleton className="h-4 w-72" /><Skeleton className="h-6 w-56 rounded-full" /></div>
          ) : loadError && !status ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={loadInitial}>Réessayer</Button>
            </div>
          ) : status ? (
            <LdapStatusDetails status={status} intervalHours={typeof interval === 'number' ? interval : null} />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button onClick={triggerSync} disabled={syncing || loadingStatus} className="min-h-11 gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              {syncing ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={deactivating} variant="outline" className="min-h-11 gap-2 text-destructive">
              <UserX className="h-4 w-4" />
              {deactivating ? 'Désactivation…' : 'Désactiver les comptes de l’annuaire'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver les comptes de l’annuaire</DialogTitle>
            <DialogDescription>
              Les comptes <strong>collaborateurs</strong> venus de l’Active Directory seront <strong>désactivés</strong> (jamais
              supprimés : leurs bons restent). Les administrateurs, les techniciens et votre propre compte ne sont jamais touchés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button variant="destructive" className="min-h-11" onClick={deactivateAll}>Désactiver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
