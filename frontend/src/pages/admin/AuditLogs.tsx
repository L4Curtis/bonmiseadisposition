import { Shield, ChevronLeft, ChevronRight, XCircle, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuditLogs } from './audit-logs/useAuditLogs';
import { AuditLogsFilters } from './audit-logs/AuditLogsFilters';
import { AuditLogsTable } from './audit-logs/AuditLogsTable';

export function AuditLogsPage() {
  const {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    userInput,
    setUserInput,
    action,
    setAction,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    availableActions,
    applySearch,
    resetFilters,
    totalPages,
    exporting,
    exportCsv,
  } = useAuditLogs();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground/70" />
          <h1 className="text-xl font-bold text-foreground">Journal d'audit</h1>
          {data && (
            <span className="text-sm text-muted-foreground/70">
              ({data.total} entrée{data.total > 1 ? 's' : ''})
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void exportCsv()}
          disabled={exporting || !data || data.total === 0}
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Export en cours...' : 'Exporter CSV'}
        </Button>
      </div>

      <AuditLogsFilters
        userInput={userInput}
        onUserInputChange={setUserInput}
        onApplySearch={applySearch}
        action={action}
        onActionChange={setAction}
        availableActions={availableActions}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onReset={resetFilters}
      />

      {data?.exportTruncated && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground" role="status">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
          <p>
            L'export CSV est limité aux {data.exportLimit.toLocaleString('fr-FR')} entrées les plus récentes :
            les {(data.total - data.exportLimit).toLocaleString('fr-FR')} plus anciennes n'y figureront pas.
            Réduisez la période ou ajoutez un filtre pour tout exporter.
          </p>
        </div>
      )}

      {/* Erreur de chargement */}
      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center" role="alert">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3 text-destructive hover:text-destructive/80">
            Réessayer
          </Button>
        </div>
      )}

      <AuditLogsTable logs={data?.logs} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total} entrée{(data?.total ?? 0) > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
