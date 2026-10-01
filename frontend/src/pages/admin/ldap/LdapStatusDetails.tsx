import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/dates';
import type { LdapSyncStatusResponse } from '@/contracts/admin';

function ResultBadge({ status }: { status: LdapSyncStatusResponse }) {
  const count = status.lastSyncCount ?? 0;
  if (status.lastSyncSuccess === null) return <Badge variant="outline">Aucune depuis le démarrage du serveur</Badge>;
  if (!status.lastSyncSuccess) {
    return <Badge variant="error" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Échec</Badge>;
  }
  if (status.lastSyncAborted) {
    return (
      <Badge variant="warning" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> Partielle ({count} compte{count > 1 ? 's' : ''} lus)
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="flex items-center gap-1">
      <CheckCircle className="h-3 w-3" /> Réussie ({count} compte{count > 1 ? 's' : ''} lus)
    </Badge>
  );
}

/**
 * État de la dernière synchronisation de l'annuaire, tel que le serveur le
 * rapporte : date, résultat, comptes ignorés, avertissement du garde-fou ou
 * erreur traduite.
 */
export function LdapStatusDetails({ status, intervalHours }: { status: LdapSyncStatusResponse; intervalHours: number | null }) {
  const skipped = status.lastSyncSkipped ?? 0;
  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <dt className="text-muted-foreground sm:w-48">Dernière synchronisation</dt>
        <dd className="font-medium">{status.lastSync ? formatDateTime(status.lastSync) : 'Jamais depuis le démarrage du serveur'}</dd>
      </div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <dt className="text-muted-foreground sm:w-48">Résultat</dt>
        <dd><ResultBadge status={status} /></dd>
      </div>
      {skipped > 0 && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <dt className="text-muted-foreground sm:w-48">Comptes ignorés</dt>
          <dd>{skipped} (adresse ou identifiant déjà pris par un autre compte)</dd>
        </div>
      )}
      </dl>
      {status.lastSyncAborted && status.lastSyncWarning && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning" role="alert">{status.lastSyncWarning}</div>
      )}
      {!status.lastSyncAborted && status.lastSyncError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive" role="alert">{status.lastSyncError}</div>
      )}
      {intervalHours !== null && (
        <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> Synchronisation automatique toutes les {Math.max(intervalHours, 6)} heures
        </p>
      )}
    </div>
  );
}
