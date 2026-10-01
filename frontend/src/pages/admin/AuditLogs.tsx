import { Shield, ChevronLeft, ChevronRight, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuditLogs } from './audit-logs/useAuditLogs';
import { AuditLogsFilters } from './audit-logs/AuditLogsFilters';
import { AuditLogsTable } from './audit-logs/AuditLogsTable';
import { AuditExportBar } from './audit-logs/AuditExportBar';

/** Journal d'audit : qui a fait quoi, raconté en phrases ; filtres gardés dans l'adresse. */
export function AuditLogsPage() {
  const {
    data, loading, loadError, load, filters, setFilters, resetFilters,
    page, setPage, totalPages,
  } = useAuditLogs();
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground/70" />
          <h1 className="text-xl font-bold text-foreground">Journal d'audit</h1>
          {data && (
            <span className="text-sm text-muted-foreground/70">
              ({total.toLocaleString('fr-FR')} entrée{total > 1 ? 's' : ''})
            </span>
          )}
        </div>
        <AuditExportBar data={data} filters={filters} />
      </div>

      <AuditLogsFilters filters={filters} onChange={setFilters} onReset={resetFilters} />

      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center" role="alert">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3 min-h-11 text-destructive hover:text-destructive/80">
            Réessayer
          </Button>
        </div>
      )}

      <AuditLogsTable logs={data?.items} loading={loading} />

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{total.toLocaleString('fr-FR')} entrée{total > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-11 w-11" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-11 w-11" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
