import { Clock } from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
import { isWaitingStatus, hasPendingSignature, type SignatureSummary } from '@/lib/bon-helpers';

interface StatusBadgeProps {
  status: BonStatus;
  signatures?: SignatureSummary[];
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, signatures }: StatusBadgeProps) {
  const showPendingSig = hasPendingSignature({ status, signatures });

  return (
    <span className="inline-flex items-center gap-x-3 gap-y-1 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${BON_STATUS_COLORS[status]}`}>
        {isWaitingStatus(status)
          ? <Clock className="h-3 w-3" strokeWidth={1.75} />
          : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
        {BON_STATUS_LABELS[status]}
      </span>
      {showPendingSig && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          En attente de signature
        </span>
      )}
    </span>
  );
}
