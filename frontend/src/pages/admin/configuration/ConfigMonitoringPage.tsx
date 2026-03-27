import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, RefreshCw, AlertTriangle, HardDrive } from 'lucide-react';

interface SmbStatus {
  enabled: boolean;
  total?: number;
  success?: number;
  failed?: number;
  pending?: number;
  lastSuccessAt?: string | null;
}

interface SmbFailedExport {
  id: string;
  bonId: string;
  filename: string;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: string | null;
  createdAt: string;
  bonReference: string;
}

export function ConfigMonitoringPage() {
  const [status, setStatus] = useState<SmbStatus | null>(null);
  const [failed, setFailed] = useState<SmbFailedExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<SmbStatus>('/admin/smb/status');
      setStatus(s);
      if (s.enabled && (s.failed ?? 0) > 0) {
        const f = await api.get<SmbFailedExport[]>('/admin/smb/failed');
        setFailed(f);
      } else {
        setFailed([]);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retryOne = async (id: string) => {
    setRetrying(id);
    try {
      await api.post(`/admin/smb/retry/${id}`);
      toast({ title: 'Export relancé', variant: 'success' });
      await load();
    } catch {
      toast({ title: 'Erreur lors du retry', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      const result = await api.post<{ retried: number; succeeded: number; failed: number }>('/admin/smb/retry-all');
      toast({
        title: `Retry terminé : ${result.succeeded} réussi(s), ${result.failed} échoué(s)`,
        variant: result.failed > 0 ? 'destructive' : 'success',
      });
      await load();
    } catch {
      toast({ title: 'Erreur lors du retry', variant: 'destructive' });
    } finally {
      setRetryingAll(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monitoring export SMB</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  if (!status || !status.enabled) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Monitoring export SMB</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">L'export SMB est désactivé. Activez-le dans la section Export SMB pour voir les statistiques.</p>
        </CardContent>
      </Card>
    );
  }

  const hasFailures = (status.failed ?? 0) > 0;
  const statusColor = hasFailures ? 'text-red-600' : 'text-green-600';
  const statusIcon = hasFailures ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Monitoring export SMB
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className={`flex items-center gap-1.5 font-medium ${statusColor}`}>
            {statusIcon}
            {hasFailures ? `${status.failed} export(s) échoué(s)` : 'Tous les exports OK'}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total : <strong className="text-foreground">{status.total ?? 0}</strong></span>
            <span>Réussis : <strong className="text-green-600">{status.success ?? 0}</strong></span>
            <span>Échoués : <strong className={hasFailures ? 'text-red-600' : 'text-foreground'}>{status.failed ?? 0}</strong></span>
            <span>En attente : <strong className="text-foreground">{status.pending ?? 0}</strong></span>
          </div>
        </div>

        {status.lastSuccessAt && (
          <p className="text-xs text-muted-foreground">
            Dernier export réussi : {new Date(status.lastSuccessAt).toLocaleString('fr-FR')}
          </p>
        )}

        {failed.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Exports échoués</p>
              <Button
                variant="outline"
                size="sm"
                onClick={retryAll}
                disabled={retryingAll}
              >
                {retryingAll ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Tout réessayer
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Bon</th>
                    <th className="text-left px-3 py-2 font-medium">Fichier</th>
                    <th className="text-left px-3 py-2 font-medium">Erreur</th>
                    <th className="text-center px-3 py-2 font-medium">Tentatives</th>
                    <th className="text-right px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {failed.slice(0, 20).map((exp) => (
                    <tr key={exp.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{exp.bonReference}</td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={exp.filename}>{exp.filename}</td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[250px] truncate" title={exp.errorMessage ?? ''}>
                        {exp.errorMessage ?? 'Erreur inconnue'}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">{exp.retryCount}/3</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryOne(exp.id)}
                          disabled={retrying === exp.id}
                          className="h-7 px-2"
                        >
                          {retrying === exp.id
                            ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                            : <RefreshCw className="h-3 w-3" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {failed.length > 20 && (
              <p className="text-xs text-muted-foreground">
                {failed.length - 20} export(s) échoué(s) supplémentaire(s) non affiché(s).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
