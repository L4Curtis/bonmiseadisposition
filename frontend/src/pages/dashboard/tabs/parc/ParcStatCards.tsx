import { Package, AlertTriangle, PackageX, PackageCheck, Tag, ScanLine } from 'lucide-react';
import { StatCard, type StatCardDelta } from '@/components/dashboard/StatCard';
import { staggerClass } from '@/components/dashboard/stagger';
import { formatDays, formatNumber } from '@/lib/kpi-format';
import type { ParcKpiResponse } from '../../types/parc';

interface ParcStatCardsProps {
  data: ParcKpiResponse | null;
  loading: boolean;
}

/** Delta « premier vs dernier point » de la série du parc prêté — nécessite au
 *  moins deux points ; sinon `undefined` (la tuile retombe alors sur `hint`). */
function loanedSeriesDelta(data: ParcKpiResponse | null): StatCardDelta | undefined {
  const series = data?.loaned.series ?? [];
  if (series.length < 2) return undefined;
  return {
    current: Number(series[series.length - 1].count),
    previous: Number(series[0].count),
  };
}

/** Rangée des six tuiles de synthèse de l'onglet Parc. */
export function ParcStatCards({ data, loading }: ParcStatCardsProps) {
  const loanedDelta = loanedSeriesDelta(data);
  const equipments = data?.returnOverdue.equipments ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        className={staggerClass(0)}
        label="Équipements prêtés"
        value={data?.loaned.total ?? null}
        icon={Package}
        loading={loading}
        hint={data ? `${formatNumber(data.loaned.bons)} bons` : undefined}
        delta={loanedDelta}
      />
      <StatCard
        className={staggerClass(1)}
        label="Retards de restitution"
        value={equipments}
        icon={AlertTriangle}
        loading={loading}
        tone={(equipments ?? 0) > 0 ? 'danger' : 'default'}
        hint={`moy. ${formatDays(data?.returnOverdue.avgDays ?? null)}`}
      />
      <StatCard
        className={staggerClass(2)}
        label="Non restitués déclarés"
        value={data?.notReturned.declared.current ?? null}
        icon={PackageX}
        loading={loading}
        delta={data ? { ...data.notReturned.declared, invert: true } : undefined}
      />
      <StatCard
        className={staggerClass(3)}
        label="Retrouvés"
        value={data?.notReturned.found.current ?? null}
        icon={PackageCheck}
        loading={loading}
        delta={data ? data.notReturned.found : undefined}
      />
      <StatCard
        className={staggerClass(4)}
        label="Part hors catalogue"
        value={data?.loaned.offCatalogShare ?? null}
        icon={Tag}
        format="percent"
        loading={loading}
      />
      <StatCard
        className={staggerClass(5)}
        label="Couverture n° de série"
        value={data?.loaned.serialCoverage ?? null}
        icon={ScanLine}
        format="percent"
        loading={loading}
      />
    </div>
  );
}
