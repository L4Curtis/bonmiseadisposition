import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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

export function LdapSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);

  const fetchStatus = async () => {
    const data = await api.get<SyncStatus>('/admin/ldap/status');
    setStatus(data);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const triggerSync = async () => {
    setSyncing(true);
    await api.post('/admin/ldap/sync');
    // Poll for result after a moment
    setTimeout(async () => {
      await fetchStatus();
      setSyncing(false);
    }, 3000);
  };

  const purgeUsers = async () => {
    setPurgeDialogOpen(false);
    setPurging(true);
    try {
      const res = await api.delete<{ message: string }>('/admin/ldap/users');
      toast({ title: res.message, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
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
          {status ? (
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
                Sync automatique toutes les 6 heures
              </div>
            </div>
          ) : (
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
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={triggerSync} disabled={syncing} className="gap-2">
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
              {purging ? 'Suppression...' : 'Purger les utilisateurs LDAP'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purger les utilisateurs LDAP</DialogTitle>
            <DialogDescription>
              Supprimer tous les utilisateurs LDAP importes ? Cette action ne supprime pas les comptes locaux.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={purgeUsers}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
