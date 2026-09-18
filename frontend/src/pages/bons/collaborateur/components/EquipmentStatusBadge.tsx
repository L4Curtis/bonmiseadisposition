import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { EquipmentItem } from '../../detail/types';

export function EquipmentStatusBadge({ eq }: { eq: EquipmentItem }) {
  if (eq.returnedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3 w-3" /> Rendu
      </span>
    );
  }
  if (eq.notReturned) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3 w-3" /> Non rendu
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
      <Clock className="h-3 w-3" /> En cours
    </span>
  );
}
