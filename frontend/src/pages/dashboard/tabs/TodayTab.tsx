import { useNavigate } from 'react-router';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { useApiResource } from '@/hooks/use-api-resource';
import type { KpiTodayResponse } from '@/contracts/kpi';
import { asOfLabel, countWithUnit, UNITS } from '../lib/kpi-scope';
import { ActionableTasksCard } from './today/ActionableTasksCard';
import { RecentBonsCard } from './today/RecentBonsCard';
import { ScheduledJobsAlert } from './today/ScheduledJobsAlert';
import { TodayTiles } from './today/TodayTiles';
import { openBonsOfFiliale } from './today/today-links';

/**
 * Onglet « Aujourd'hui » (IT) : états du jour, jamais filtrés par une période
 * (`GET /kpi/aujourdhui`). Chaque tuile et chaque ligne mène à la liste ou au
 * bon qu'elle compte. Sur téléphone, « À traiter » passe en premier.
 */
export function TodayTab() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApiResource<KpiTodayResponse>(
    '/kpi/aujourdhui',
    "Erreur lors du chargement de l'accueil",
  );

  const filialeRows = (data?.openBonsByFiliale ?? []).map((f) => ({
    key: f.id,
    label: f.name,
    count: f.count,
    onClick: () => navigate(openBonsOfFiliale(f.id)),
  }));

  return (
    <div className="space-y-5 sm:space-y-6">
      <ScheduledJobsAlert />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>Réessayer</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* Téléphone : le travail du jour d'abord, les compteurs ensuite. */}
          <div className="order-2 md:order-1">
            <TodayTiles data={data} loading={loading} />
          </div>
          <div className="order-1 md:order-2">
            <ActionableTasksCard data={data} loading={loading} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecentBonsCard />

        <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
              Bons ouverts par filiale
            </h3>
            {data && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                {`${countWithUnit(data.openBons, UNITS.bons)} ni clôturés ni annulés, ${asOfLabel(data.asOf)}`}
              </p>
            )}
          </div>
          <BreakdownBars rows={filialeRows} emptyMessage="Aucun bon ouvert" />
        </div>
      </div>
    </div>
  );
}
