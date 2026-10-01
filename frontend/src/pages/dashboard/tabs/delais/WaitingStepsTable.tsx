import { cn } from '@/lib/utils';
import { LATENESS_LABELS } from '@/domain/labels';
import { formatDays, formatNumber } from '@/lib/kpi-format';
import type { WaitingStep } from '../../types/delais';

export interface WaitingStepsTableProps {
  steps: WaitingStep[];
  thresholdDays: number;
}

/** Signatures attendues par document (état du jour) : nombre de bons,
 *  ancienneté moyenne de la demande, et combien sont en « Signature en retard ». */
export function WaitingStepsTable({ steps, thresholdDays }: WaitingStepsTableProps) {
  return (
    <table className="w-full text-sm" aria-label="Signatures attendues par document">
      <thead>
        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <th scope="col" className="py-2 pr-2">Document</th>
          <th scope="col" className="py-2 pr-2">Bons</th>
          <th scope="col" className="py-2 pr-2">Attente moyenne</th>
          <th scope="col" className="py-2">{`${LATENESS_LABELS.signature} (plus de ${thresholdDays} j)`}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {steps.map((step) => (
          <tr key={step.step}>
            <td className="py-2.5 pr-2 text-foreground/80">{step.label}</td>
            <td className="py-2.5 pr-2 tabular-nums text-foreground/80">{formatNumber(step.count)}</td>
            <td className="py-2.5 pr-2 tabular-nums text-foreground/80">{formatDays(step.avgAgeDays)}</td>
            <td className={cn('py-2.5 tabular-nums font-medium', step.overdueSignatures > 0 ? 'text-destructive' : 'text-foreground/80')}>
              {formatNumber(step.overdueSignatures)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
