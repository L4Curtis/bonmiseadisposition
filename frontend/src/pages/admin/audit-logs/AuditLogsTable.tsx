import { useNavigate } from 'react-router';
import { Shield, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/dates';
import { ActionBadge } from './ActionBadge';
import { DetailCell } from './DetailCell';
import type { AuditLog } from './types';

function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

interface AuditLogsTableProps {
  logs: AuditLog[] | undefined;
  loading: boolean;
}

/** Table du journal d'audit : gère elle-même le chargement et l'état vide. */
export function AuditLogsTable({ logs, loading }: AuditLogsTableProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : !logs?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground/70">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aucune entrée trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Journal d'audit">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Date/Heure</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Utilisateur</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bon</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5"><ActionBadge action={log.action} /></td>
                    <td className="px-4 py-2.5 text-xs">
                      {(() => {
                        const name = log.user?.displayName;
                        const email = log.userEmail ?? log.user?.email ?? null;
                        if (!name && !email) return <span className="text-muted-foreground/70">{'—'}</span>;
                        return (
                          <div className="leading-tight">
                            <div className="font-medium text-foreground/80">{name ?? email}</div>
                            {name && email && email !== name && (
                              <div className="text-muted-foreground/70">{email}</div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {log.bon ? (
                        <button
                          className="flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                          onClick={() => navigate(`/bons/${log.bon!.id}`)}
                        >
                          {log.bon.reference}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : <span className="text-muted-foreground/70">{'—'}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground/70 font-mono">
                      {log.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-sm">
                      <DetailCell details={log.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
