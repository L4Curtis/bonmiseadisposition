import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { EquipmentItem } from '../../detail/types';

export function EquipmentStatusBadge({ eq }: { eq: EquipmentItem }) {
  if (eq.returnedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> Rendu
      </span>
    );
  }
  if (eq.notReturned) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
        <XCircle className="h-3 w-3" /> Non rendu
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
      <Clock className="h-3 w-3" /> En cours
    </span>
  );
}
