import { Clock } from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
import { isWaitingStatus, hasPendingSignature, type SignatureSummary } from '@/lib/bon-helpers';

interface StatusBadgeProps {
  status: BonStatus;
  signatures?: SignatureSummary[];
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, signatures, size = 'sm' }: StatusBadgeProps) {
  const py = size === 'sm' ? 'py-0.5' : 'py-1';
  const showPendingSig = hasPendingSignature({ status, signatures });

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 ${py} text-xs font-medium ${BON_STATUS_COLORS[status]}`}>
        {isWaitingStatus(status)
          ? <Clock className="h-3 w-3" />
          : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
        {BON_STATUS_LABELS[status]}
      </span>
      {showPendingSig && (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 ${py} text-xs font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-1 ring-inset ring-orange-500/25`}>
          <Clock className="h-3 w-3" />
          En attente de signature
        </span>
      )}
    </span>
  );
}
