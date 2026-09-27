import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { CONTESTATION_STATUS_LABELS } from '@/domain/labels';
import { KpiCard } from '../../components/KpiCard';
import { UNITS } from '../../lib/kpi-scope';
import type { Contestations } from '../../types/incidents';

export interface ContestationsSummaryProps {
  contestations: Contestations;
  /** « du 27/08 au 25/09 ». */
  scope: string;
}

/** Contestations tranchées sur la période : délai de décision et issues
 *  (Fondée : le bon est corrigé ; Non retenue : rien ne change). */
export function ContestationsSummary({ contestations, scope }: ContestationsSummaryProps) {
  const { resolutionMedianDays, founded, notRetained, decided } = contestations;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        label="Délai de décision" value={resolutionMedianDays.current} format="days" icon={Clock} scope={scope}
        detail={`médiane, sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        delta={resolutionMedianDays.current !== null
          ? { current: resolutionMedianDays.current, previous: resolutionMedianDays.previous, invert: true }
          : undefined}
        definition="Temps entre la réception d'une contestation et la décision. La médiane : la moitié sont tranchées plus vite."
      />
      <KpiCard
        label={CONTESTATION_STATUS_LABELS.resolved} value={founded.current} unit={UNITS.contestations}
        icon={CheckCircle2} scope={scope} detail={`sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        definition="Contestation fondée : le bon est corrigé par un nouveau bon envoyé au collaborateur."
      />
      <KpiCard
        label={CONTESTATION_STATUS_LABELS.rejected} value={notRetained.current} unit={UNITS.contestations}
        icon={XCircle} scope={scope} detail={`sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        definition="Contestation non retenue : le bon reste tel quel."
      />
    </div>
  );
}
