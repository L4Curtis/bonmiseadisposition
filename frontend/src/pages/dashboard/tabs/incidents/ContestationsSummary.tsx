import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { CONTESTATION_STATUS_LABELS } from '@/domain/labels';
import { KpiCard } from '../../components/KpiCard';
import { UNITS } from '../../lib/kpi-scope';
import type { Contestations } from '../../types/incidents';
import { NO_LIST } from '../../lists/kpi-lists';
import type { ListHref } from './incident-stat-cards';

export interface ContestationsSummaryProps {
  contestations: Contestations;
  /** « du 27/08 au 25/09 ». */
  scope: string;
  /** Listes des contestations tranchées (IT) ; `null` pour la direction. */
  listHref: ListHref;
}

/** Contestations tranchées sur la période : délai de décision (médiane, sans
 *  liste) et issues, qui ouvrent la liste des contestations qu'elles comptent
 *  (IT). Fondée : le bon est corrigé ; Non retenue : rien ne change. */
export function ContestationsSummary({ contestations, scope, listHref }: ContestationsSummaryProps) {
  const { resolutionMedianDays, founded, notRetained, decided } = contestations;
  const list = (key: 'contestations_fondees' | 'contestations_non_retenues') =>
    listHref ? { href: listHref(key) } : { noList: NO_LIST.direction };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        label="Délai de décision" value={resolutionMedianDays.current} format="days" icon={Clock} scope={scope}
        detail={`médiane, sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        delta={resolutionMedianDays.current !== null
          ? { current: resolutionMedianDays.current, previous: resolutionMedianDays.previous, invert: true }
          : undefined}
        definition="Temps entre la réception d'une contestation et la décision. La médiane : la moitié sont tranchées plus vite."
        noList={NO_LIST.decisionDelay}
      />
      <KpiCard
        label={CONTESTATION_STATUS_LABELS.resolved} value={founded.current} unit={UNITS.contestations}
        icon={CheckCircle2} scope={scope} detail={`sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        definition="Contestations jugées fondées pendant la période : le bon est corrigé (nouveau bon pour une remise, document renvoyé à signer pour une restitution ou un PV)."
        {...list('contestations_fondees')}
      />
      <KpiCard
        label={CONTESTATION_STATUS_LABELS.rejected} value={notRetained.current} unit={UNITS.contestations}
        icon={XCircle} scope={scope} detail={`sur ${decided.current} tranchée${decided.current > 1 ? 's' : ''}`}
        definition="Contestations non retenues pendant la période : le bon reste tel quel."
        {...list('contestations_non_retenues')}
      />
    </div>
  );
}
