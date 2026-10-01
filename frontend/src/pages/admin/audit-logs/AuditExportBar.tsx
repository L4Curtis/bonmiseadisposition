import { ExportButton } from '@/components/export';
import { exportFilters, filterQuery, type AuditFilters } from './auditFilters';
import type { AuditList } from './useAuditLogs';

interface AuditExportBarProps {
  data: AuditList | null;
  filters: AuditFilters;
}

const ITEM_LABEL = { singular: 'action', plural: 'actions' } as const;

/**
 * Export CSV du journal, par le bouton commun : avant, la confirmation annonce
 * « N actions, filtres : … » (le total de la liste, mêmes filtres) et prévient
 * au-delà du plafond du serveur ; après, un bandeau si le fichier a été coupé.
 */
export function AuditExportBar({ data, filters }: AuditExportBarProps) {
  const query = filterQuery(filters).toString();
  return (
    <ExportButton
      path={`/audit/export${query ? `?${query}` : ''}`}
      fallbackFilename="journal-audit.csv"
      filters={exportFilters(filters)}
      count={data ? data.total : null}
      limit={data?.meta?.exportLimit}
      itemLabel={ITEM_LABEL}
      title="Exporter le journal d'audit"
      note="Une ligne par action : date (heure de Paris), action, description, auteur et bon. Ni adresse IP, ni données personnelles libres."
      errorMessage="Erreur lors de l'export du journal."
      disabled={!data || data.total === 0}
    />
  );
}
