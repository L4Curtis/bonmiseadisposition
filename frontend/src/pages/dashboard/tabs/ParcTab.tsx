import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { TimeSeriesChart } from '@/components/dashboard/charts/TimeSeriesChart';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { HorizontalBars } from '@/components/dashboard/charts/HorizontalBars';
import { staggerClass } from '@/components/dashboard/stagger';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { todayInParis } from '@/lib/kpi-period';
import { usePeriodParams } from '../use-period-params';
import type { ParcKpiResponse } from '../types/parc';
import { ParcStatCards } from './parc/ParcStatCards';
import { ReturnOverdueTable } from './parc/ReturnOverdueTable';

/** Onglet « Parc » (GET /kpi/parc) : parc prêté (total, catégories, filiales,
 *  modèles), retards de restitution, non rendus déclarés/retrouvés, et export
 *  CSV de l'inventaire. Accessible à l'IT et à Direction (lecture seule). */
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

  const [exportLoading, setExportLoading] = useState(false);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const path = `/reporting/inventory/export${filialeId ? `?filialeId=${filialeId}` : ''}`;
      const blob = await api.getBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventaire-${todayInParis()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export CSV.");
    } finally {
      setExportLoading(false);
    }
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
      onClick: () => navigate(`/inventaire?filialeId=${f.filialeId}`),
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

      <ParcStatCards data={data} loading={loading} />

      <ChartCard
        title="Évolution du parc prêté"
        subtitle="Estimation en fin de période"
        delayIndex={1}
        loading={loading}
        empty={!loading && (data?.loaned.series.length ?? 0) === 0}
      >
        <TimeSeriesChart
          data={data?.loaned.series ?? []}
          series={[{ key: 'count', label: 'Équipements prêtés' }]}
          granularity={data?.period.granularity ?? 'day'}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Répartition par catégorie" delayIndex={2} loading={loading} empty={!loading && categoryData.length === 0}>
          <DonutChart data={categoryData} />
        </ChartCard>

        <ChartCard title="Par filiale" delayIndex={3} loading={loading} empty={!loading && filialeRows.length === 0}>
          <BreakdownBars rows={filialeRows} />
        </ChartCard>
      </div>

      <ChartCard title="Modèles les plus prêtés" delayIndex={4} loading={loading} empty={!loading && topModelsData.length === 0}>
        <HorizontalBars data={topModelsData} />
      </ChartCard>

      <ChartCard
        title="Retards de restitution (top 10)"
        delayIndex={5}
        loading={loading}
        empty={!loading && overdueTop.length === 0}
        emptyMessage="Aucun retard"
      >
        <ReturnOverdueTable rows={overdueTop} canLinkToBon={isIt} />
      </ChartCard>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={handleExport} disabled={exportLoading || loading}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exporter l&apos;inventaire (CSV)
        </Button>
      </div>
    </div>
  );
}
