import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

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
    if (!confirm('Supprimer tous les utilisateurs LDAP importés ? Cette action ne supprime pas les comptes locaux.')) return;
    setPurging(true);
    setPurgeMsg(null);
    try {
      const res = await api.delete<{ message: string }>('/admin/ldap/users');
      setPurgeMsg(res.message);
    } catch {
      setPurgeMsg('Erreur lors de la suppression');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Synchronisation LDAP</h1>

      <Card>
        <CardHeader>
          <CardTitle>Statut de la synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 w-40">Dernière sync :</span>
                <span className="text-sm font-medium">
                  {status.lastSync
                    ? new Date(status.lastSync).toLocaleString('fr-FR')
                    : 'Jamais'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 w-40">Résultat :</span>
                {status.lastSyncSuccess === null ? (
                  <Badge variant="outline">En attente</Badge>
                ) : status.lastSyncSuccess ? (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Succès ({status.lastSyncCount} utilisateurs)
                  </Badge>
                ) : (
                  <Badge variant="error" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Échec
                  </Badge>
                )}
              </div>
              {status.lastSyncError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700 font-mono">{status.lastSyncError}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                Sync automatique toutes les 6 heures
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Chargement...</div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={triggerSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisation en cours...' : 'Lancer une sync manuelle'}
            </Button>
            <Button onClick={purgeUsers} disabled={purging} variant="destructive" className="gap-2">
              <Trash2 className="h-4 w-4" />
              {purging ? 'Suppression...' : 'Purger les utilisateurs LDAP'}
            </Button>
          </div>
          {purgeMsg && (
            <p className="text-sm text-slate-600 mt-2">{purgeMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
