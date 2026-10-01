import { Link } from 'react-router';
import { Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/dates';
import { ActionBadge } from './ActionBadge';
import { actorEmail, actorName, describeAuditEntry } from './auditEntry';
import type { AuditLogEntry } from './types';

function ListSkeleton() {
  return (
    <div className="p-4 space-y-3" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-64" />
        </div>
      ))}
    </div>
  );
}

function Actor({ entry }: { entry: AuditLogEntry }) {
  const name = actorName(entry);
  const email = actorEmail(entry);
  if (!name) return <span className="text-muted-foreground/70">Le système</span>;
  return (
    <div className="leading-tight min-w-0">
      <div className="font-medium text-foreground/80 break-words">{name}</div>
      {email && <div className="truncate text-muted-foreground/70" title={email}>{email}</div>}
    </div>
  );
}

function BonLink({ entry }: { entry: AuditLogEntry }) {
  if (!entry.bon) return <span className="text-muted-foreground/70">—</span>;
  return (
    <Link
      to={`/bons/${entry.bon.id}`}
      className="inline-flex min-h-11 items-center font-mono font-semibold text-primary hover:underline"
    >
      {entry.bon.reference}
    </Link>
  );
}

/** Bureau : un tableau Date / Qui / Action / Description / Bon. Masqué par son
 *  conteneur : sur téléphone, la feuille de style globale rend tout tableau
 *  défilant (`display: block`), ce qui l'emporterait sur `hidden`. */
function DesktopTable({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <div className="hidden md:block">
      <table className="w-full text-sm" aria-label="Journal d'audit">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Qui</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bon</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((entry) => {
            const view = describeAuditEntry(entry);
            return (
              <tr key={entry.id} className="border-b last:border-0 align-top hover:bg-muted/40">
                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td className="px-4 py-2.5 text-xs w-56 max-w-[14rem]"><Actor entry={entry} /></td>
                <td className="px-4 py-2.5"><ActionBadge label={view.label} tone={view.tone} /></td>
                <td className="px-4 py-2.5 text-sm text-foreground/90">{view.sentence}</td>
                <td className="px-4 py-1 text-xs"><BonLink entry={entry} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Téléphone : une carte par entrée, sans défilement horizontal. */
function MobileCards({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <ul className="md:hidden divide-y" aria-label="Journal d'audit">
      {logs.map((entry) => {
        const view = describeAuditEntry(entry);
        return (
          <li key={entry.id} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ActionBadge label={view.label} tone={view.tone} />
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
            </div>
            <p className="text-sm text-foreground/90 break-words">{view.sentence}</p>
            <div className="text-xs"><Actor entry={entry} /></div>
            {entry.bon && <div className="text-xs"><BonLink entry={entry} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

interface AuditLogsTableProps {
  logs: AuditLogEntry[] | undefined;
  loading: boolean;
}

/** Entrées du journal, lisibles : la phrase du catalogue, jamais de clé technique. */
export function AuditLogsTable({ logs, loading }: AuditLogsTableProps) {
  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : !logs?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground/70">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aucune entrée trouvée</p>
          </div>
        ) : (
          <>
            <DesktopTable logs={logs} />
            <MobileCards logs={logs} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
