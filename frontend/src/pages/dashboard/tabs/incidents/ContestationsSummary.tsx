import { CheckCircle2, ClipboardCheck, Clock } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import type { Contestations } from '../../types/incidents';

export interface ContestationsSummaryProps {
  contestations: Contestations;
  loading?: boolean;
}

/** Trois indicateurs en ligne pour la carte « Contestations » : délai médian
 *  de traitement, taux d'acceptation, et nombre de contestations clôturées
 *  sur la période. */
export function ContestationsSummary({ contestations, loading }: ContestationsSummaryProps) {
  const { resolutionMedianDays, acceptanceRate, closed } = contestations;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Délai médian de traitement"
        value={resolutionMedianDays.current}
        format="days"
        icon={Clock}
        loading={loading}
        delta={resolutionMedianDays.current !== null
          ? { current: resolutionMedianDays.current, previous: resolutionMedianDays.previous, invert: true }
          : undefined}
      />
      <StatCard
        label="Taux d'acceptation"
        value={acceptanceRate.current}
        format="percent"
        icon={CheckCircle2}
        loading={loading}
        delta={acceptanceRate.current !== null
          ? { current: acceptanceRate.current, previous: acceptanceRate.previous }
          : undefined}
      />
      <StatCard
        label="Clôturées sur la période"
        value={closed.current}
        icon={ClipboardCheck}
        loading={loading}
      />
    </div>
  );
}
