import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { TimeSeriesChart } from '@/components/dashboard/charts/TimeSeriesChart';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { HorizontalBars } from '@/components/dashboard/charts/HorizontalBars';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { todayInParis } from '@/lib/dates';
import { CSV_EXPORT_SUCCESS, useDownload } from '@/hooks/useDownload';
import { usePeriodParams } from '../use-period-params';
import type { ParcKpiResponse } from '../types/parc';
import { ParcStatCards } from './parc/ParcStatCards';
import { ReturnOverdueTable } from './parc/ReturnOverdueTable';
import { inventoryHref } from './parc/ParcStatCards';
import { LATENESS_LABELS } from '@/domain/labels';
import { asOfLabel, countWithUnit, shortDate, UNITS } from '../lib/kpi-scope';

/** Ce que montre la courbe, et pourquoi son dernier point peut différer de la
 *  carte : seulement quand la période s'arrête avant aujourd'hui. */
function seriesSubtitle(data: ParcKpiResponse | null): string {
  const base = 'Nombre en fin de journée.';
  if (!data) return base;
  if (data.period.to >= todayInParis()) return `${base} Le dernier point est l'état d'aujourd'hui, égal à la carte.`;
  return `${base} La période s'arrête le ${shortDate(data.period.to)} : la carte donne l'état ${asOfLabel(data.asOf)}.`;
}

/** Onglet « Parc » (GET /kpi/parc) : équipements chez les collaborateurs
 *  (catégories, filiales, modèles), « Retour en retard », non-restitutions, et
 *  export CSV de l'inventaire. Accessible à l'IT et à la direction (lecture
 *  seule, sans lien vers les bons). Les cartes ouvrent l'inventaire filtré. */
export function ParcTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { from, to, filialeId } = usePeriodParams();
  const isIt = isItRole(user?.role);

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (filialeId) params.set('filialeId', filialeId);
    return params.toString();
  }, [from, to, filialeId]);

  const { data, loading, error, reload } = useApiResource<ParcKpiResponse>(
    `/kpi/parc?${query}`,
    'Impossible de charger les indicateurs du parc',
  );

  const { download, downloading: exportLoading } = useDownload();

  const handleExport = async (): Promise<void> => {
    await download({
      path: `/reporting/inventory/export${filialeId ? `?filialeId=${encodeURIComponent(filialeId)}` : ''}`,
      fallbackFilename: `inventaire-${todayInParis()}.csv`,
      errorMessage: "Erreur lors de l'export CSV.",
      success: CSV_EXPORT_SUCCESS,
    });
  };

  const categoryData = useMemo(
    () => (data?.loaned.byCategory ?? []).map((c) => ({ key: c.category, label: c.label, value: c.count })),
    [data],
  );
  const filialeRows = useMemo(
    () => (data?.loaned.byFiliale ?? []).map((f) => ({
      key: f.filialeId,
      label: f.name,
      count: f.count,
      onClick: () => navigate(inventoryHref(f.filialeId)),
    })),
    [data, navigate],
  );
  const topModelsData = useMemo(
    () => (data?.loaned.topModels ?? []).map((m) => ({ key: m.catalogItemId, label: m.label, value: m.count })),
    [data],
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>Réessayer</Button>
      </div>
    );
  }

  const overdueTop = data?.returnOverdue.top ?? [];

  return (
    <div className="space-y-6">
      <h2 className="sr-only">Parc et prêts</h2>

      <ParcStatCards data={data} loading={loading} filialeId={filialeId} />

      <ChartCard
        title="Équipements chez les collaborateurs, jour après jour"
        subtitle={seriesSubtitle(data)}
        delayIndex={1}
        loading={loading}
        empty={!loading && (data?.loaned.series.length ?? 0) === 0}
      >
        <TimeSeriesChart
          data={data?.loaned.series ?? []}
          series={[{ key: 'count', label: 'Équipements chez les collaborateurs' }]}
          granularity={data?.period.granularity ?? 'day'}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Par catégorie" subtitle={data ? asOfLabel(data.asOf) : undefined} delayIndex={2} loading={loading} empty={!loading && categoryData.length === 0}>
          <DonutChart data={categoryData} />
        </ChartCard>

        <ChartCard title="Par filiale" subtitle={data ? `${asOfLabel(data.asOf)}, cliquer pour ouvrir l'inventaire` : undefined} delayIndex={3} loading={loading} empty={!loading && filialeRows.length === 0}>
          <BreakdownBars rows={filialeRows} />
        </ChartCard>
      </div>

      <ChartCard title="Modèles les plus prêtés" subtitle={data ? `10 premiers, ${asOfLabel(data.asOf)}` : undefined} delayIndex={4} loading={loading} empty={!loading && topModelsData.length === 0}>
        <HorizontalBars data={topModelsData} />
      </ChartCard>

      <ChartCard
        title={`${LATENESS_LABELS.return} : les 10 bons les plus en retard`}
        subtitle={data ? `${countWithUnit(data.returnOverdue.equipments, UNITS.equipments)} sur ${countWithUnit(data.returnOverdue.bons, UNITS.bons)}, ${asOfLabel(data.asOf)}` : undefined}
        delayIndex={5}
        loading={loading}
        empty={!loading && overdueTop.length === 0}
        emptyMessage="Aucun retour en retard"
      >
        <ReturnOverdueTable rows={overdueTop} canLinkToBon={isIt} filialeId={filialeId} />
      </ChartCard>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={handleExport} disabled={exportLoading || loading}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exporter l&apos;inventaire{filialeId ? ' de la filiale' : ''} (CSV)
        </Button>
      </div>
    </div>
  );
}
