import { ExportButton, type ExportFilter } from '@/components/export';
import { useActiveFiliales } from '@/hooks/use-active-filiales';
import { formatDate } from '@/lib/dates';

/** Onglets dont les indicateurs s'exportent (« Aujourd'hui » n'a que des listes). */
export type KpiExportTab = 'parc' | 'delais' | 'incidents';

const TAB_LABELS: Readonly<Record<KpiExportTab, string>> = {
  parc: 'Parc',
  delais: 'Délais',
  incidents: 'Incidents',
};

export interface KpiExportButtonProps {
  readonly tab: KpiExportTab;
  /** Période de l'écran (AAAA-MM-JJ), gardée telle quelle par l'export. */
  readonly from: string;
  readonly to: string;
  readonly filialeId: string | null;
  readonly className?: string;
}

/** Chemin de l'export de l'onglet, avec la période et la filiale de l'écran. */
export function kpiExportPath(tab: KpiExportTab, from: string, to: string, filialeId: string | null): string {
  const params = new URLSearchParams({ from, to });
  if (filialeId) params.set('filialeId', filialeId);
  return `/kpi/${tab}/export?${params.toString()}`;
}

/**
 * « Exporter ces indicateurs » : le fichier CSV des chiffres de l'onglet
 * affiché (mêmes libellés, même période, même filiale). Avant l'export, la
 * confirmation rappelle l'onglet, la période et la filiale.
 */
export function KpiExportButton({ tab, from, to, filialeId, className }: KpiExportButtonProps) {
  const { filiales } = useActiveFiliales();
  const filialeName = filialeId
    ? filiales.find((f) => f.id === filialeId)?.displayName ?? 'filiale choisie'
    : 'Toutes les filiales';
  const filters: ExportFilter[] = [
    { label: 'Onglet', value: TAB_LABELS[tab] },
    { label: 'Période', value: `du ${formatDate(from)} au ${formatDate(to)}` },
    { label: 'Filiale', value: filialeName },
  ];

  return (
    <ExportButton
      className={className}
      path={kpiExportPath(tab, from, to, filialeId)}
      fallbackFilename={`indicateurs-${tab}-${from}-au-${to}.csv`}
      filters={filters}
      uncounted
      label="Exporter ces indicateurs"
      title={`Exporter les indicateurs de l’onglet ${TAB_LABELS[tab]}`}
      note="Les états du jour sont datés du jour du calcul ; les chiffres « sur la période » sont comparés à la période précédente."
      errorMessage="Erreur lors de l'export des indicateurs."
    />
  );
}
