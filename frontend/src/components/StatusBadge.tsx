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
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 ${py} text-xs font-medium ${BON_STATUS_COLORS[status]}`}>
        {isWaitingStatus(status) && <Clock className="h-3 w-3" />}
        {BON_STATUS_LABELS[status]}
      </span>
      {showPendingSig && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 ${py} text-xs font-medium bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400`}>
          <Clock className="h-3 w-3" />
          En attente de signature
        </span>
      )}
    </span>
  );
}
