import { useMemo } from 'react';
import { Link } from 'react-router';
import { MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { BreakdownBars } from '@/components/dashboard/BreakdownBars';
import { EmptyPeriodNotice } from '@/components/dashboard/EmptyPeriodNotice';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { KpiCard, KpiCardSkeleton } from '../components/KpiCard';
import { periodLabel, UNITS } from '../lib/kpi-scope';
import { usePeriodParams } from '../use-period-params';
import type { IncidentsKpiResponse, ReasonCount } from '../types/incidents';
import { incidentFlowCards, incidentStateCards } from './incidents/incident-stat-cards';
import { ContestationsSummary } from './incidents/ContestationsSummary';
import { RemindersSection } from './incidents/RemindersSection';

function reasonRows(reasons: ReasonCount[]) {
  return reasons.map((r) => ({ key: r.reason, label: r.reason, count: r.count }));
}

/** Onglet « Incidents » (`GET /kpi/incidents`) : états du jour d'abord (non
 *  filtrés par la période), puis ce qui s'est passé sur la période. */
export function IncidentsTab() {
  const { from, to, filialeId, preset, setPreset } = usePeriodParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isIt = isItRole(user?.role);

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (filialeId) params.set('filialeId', filialeId);
    return params.toString();
  }, [from, to, filialeId]);

  const { data, loading, error, reload } = useApiResource<IncidentsKpiResponse>(
    `/kpi/incidents?${query}`,
    "Impossible de charger les indicateurs d'incidents",
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>Réessayer</Button>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  const scope = periodLabel(data.period);
  const flowCards = incidentFlowCards(data);
  const noReminder = data.reminders.byRank.every((r) => r.sent.current === 0);
  const noDecision = data.contestations.decided.current === 0;
  const quiet = noReminder && flowCards.every((c) => (c.value ?? 0) === 0) && data.failedEmails.count.current === 0;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">État du jour</h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {incidentStateCards(data, isIt).map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sur la période</h3>
        {quiet && (
          <EmptyPeriodNotice
            quoi="incident, rappel ou contestation"
            onElargir={() => setPreset('12m')}
            elargissementPossible={preset !== '12m'}
          />
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {flowCards.map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
          <div className="flex flex-col gap-1">
            <KpiCard
              label="Emails en échec" value={data.failedEmails.count.current} unit={UNITS.emails} icon={MailWarning}
              tone={data.failedEmails.count.current > 0 ? 'danger' : 'default'} scope={scope}
              delta={{ ...data.failedEmails.count, invert: true }}
              definition="Emails que le serveur n'a pas pu envoyer ou que la messagerie du destinataire a rejetés. Un bon sans adresse email (signature sur place) n'est pas un échec : il n'est pas compté."
            />
            {isAdmin && (
              <Link to="/admin/configuration/monitoring" className="px-1 py-2 text-[11px] font-medium text-primary hover:underline">
                Voir la supervision
              </Link>
            )}
          </div>
        </div>
      </section>

      <ChartCard title="Contestations tranchées" subtitle={scope} delayIndex={1} empty={noDecision}
        emptyMessage="Aucune contestation tranchée sur la période.">
        <ContestationsSummary contestations={data.contestations} scope={scope} />
      </ChartCard>

      <ChartCard title="Rappels automatiques" subtitle={`${scope}, trois rappels au plus par document`} delayIndex={2}
        empty={noReminder} emptyMessage="Aucun rappel envoyé sur la période.">
        <RemindersSection reminders={data.reminders} scope={scope} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Motifs des remises constatées sans signature" subtitle={scope} delayIndex={3}
          empty={data.withoutSignature.handoverReasons.length === 0} emptyMessage="Aucune remise sans signature sur la période.">
          <BreakdownBars rows={reasonRows(data.withoutSignature.handoverReasons)} />
        </ChartCard>
        <ChartCard title="Motifs des clôtures sans signature" subtitle={scope} delayIndex={4}
          empty={data.withoutSignature.closureReasons.length === 0} emptyMessage="Aucune clôture sans signature sur la période.">
          <BreakdownBars rows={reasonRows(data.withoutSignature.closureReasons)} />
        </ChartCard>
      </div>
    </div>
  );
}
