import { useMemo } from 'react';
import { Link } from 'react-router';
import { MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { staggerClass } from '@/components/dashboard/stagger';
import { EmptyPeriodNotice } from '@/components/dashboard/EmptyPeriodNotice';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { usePeriodParams } from '../use-period-params';
import type { IncidentsKpiResponse } from '../types/incidents';
import { buildIncidentStatCards } from './incidents/incident-stat-cards';
import { ContestationsSummary } from './incidents/ContestationsSummary';
import { RemindersSection } from './incidents/RemindersSection';

/** Onglet « Incidents » (GET /kpi/incidents) — qualité et incidents du parc :
 *  non rendus, PV de clôture, clôtures unilatérales, annulations,
 *  contestations, rappels par rang et emails en échec.
 *
 *  Un seul appel API alimente tout l'onglet : une erreur de chargement
 *  masque donc l'intégralité du contenu derrière un message unique avec
 *  « Réessayer », plutôt que de dupliquer l'état d'erreur par bloc. */
export function IncidentsTab() {
  const { from, to, filialeId, preset, setPreset } = usePeriodParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (filialeId) params.set('filialeId', filialeId);
    return params.toString();
  }, [from, to, filialeId]);

  const { data, loading, error, reload } = useApiResource<IncidentsKpiResponse>(
    `/kpi/incidents?${query}`,
    "Impossible de charger les indicateurs d'incidents",
  );

  const topStatCards = useMemo(() => buildIncidentStatCards(data, loading), [data, loading]);
  const reasonRows = useMemo(
    () => (data?.unilateralClosures.reasons ?? []).map((r) => ({ key: r.reason, label: r.reason, count: r.count })),
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

  const contestationsEmpty = data
    ? data.contestations.opened.current === 0 && data.contestations.closed.current === 0
    : false;
  const remindersEmpty = data ? data.reminders.byRank.length === 0 : false;
  const reasonsEmpty = reasonRows.length === 0;
  // Aucun incident du tout sur la période : on l'annonce, sinon l'onglet n'est
  // qu'une grille de zéros dont on ne sait pas s'ils sont justes.
  const periodeVide =
    !!data &&
    contestationsEmpty &&
    remindersEmpty &&
    reasonsEmpty &&
    data.notReturned.declared.current === 0 &&
    data.notReturned.found.current === 0 &&
    data.pvCloture.emitted.current === 0 &&
    data.cancellations.count.current === 0;
  const failedEmails = data?.failedEmails.count ?? null;

  return (
    <div className="space-y-6">
      {periodeVide && (
        <EmptyPeriodNotice
          quoi="incident, rappel ou contestation"
          onElargir={() => setPreset('12m')}
          elargissementPossible={preset !== '12m'}
        />
      )}

      {/* ── Tuiles principales ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topStatCards.map((card, index) => (
          <StatCard key={card.key} {...card.props} hint={card.footer} className={staggerClass(index)} />
        ))}
      </div>

      {/* ── Contestations ── */}
      <ChartCard
        title="Contestations"
        delayIndex={1}
        loading={loading}
        empty={contestationsEmpty}
        emptyMessage="Aucune contestation sur la période."
      >
        {data && <ContestationsSummary contestations={data.contestations} loading={loading} />}
      </ChartCard>

      {/* ── Rappels par rang ── */}
      <ChartCard
        title="Rappels par rang"
        delayIndex={2}
        loading={loading}
        empty={remindersEmpty}
        emptyMessage="Aucun rappel envoyé sur la période."
      >
        {data && <RemindersSection reminders={data.reminders} loading={loading} />}
      </ChartCard>

      {/* ── Motifs de clôture unilatérale ── */}
      <ChartCard
        title="Motifs de clôture unilatérale"
        delayIndex={3}
        loading={loading}
        empty={reasonsEmpty}
        emptyMessage="Aucune clôture unilatérale sur la période."
      >
        <BreakdownBars rows={reasonRows} />
      </ChartCard>

      {/* ── Emails en échec ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <StatCard
            className={staggerClass(4)}
            label="Emails en échec"
            value={failedEmails?.current ?? null}
            icon={MailWarning}
            tone={(failedEmails?.current ?? 0) > 0 ? 'danger' : 'default'}
            loading={loading}
            delta={failedEmails
              ? { current: failedEmails.current, previous: failedEmails.previous, invert: true }
              : undefined}
          />
          {!loading && isAdmin && (
            <Link
              to="/admin/configuration/monitoring"
              className="px-1 text-[11px] font-medium text-primary hover:underline"
            >
              Voir le monitoring
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
