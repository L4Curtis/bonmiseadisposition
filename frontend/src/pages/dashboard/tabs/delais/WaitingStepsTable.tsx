import { cn } from '@/lib/utils';
import { formatDays, formatNumber } from '@/lib/kpi-format';
import type { WaitingStep } from '../../types/delais';

export interface WaitingStepsTableProps {
  steps: WaitingStep[];
}

/** Table des bons en attente par étape de workflow — nombre, ancienneté
 *  moyenne et nombre en retard (mis en évidence en rouge). */
export function WaitingStepsTable({ steps }: WaitingStepsTableProps) {
  return (
    <table className="w-full text-sm" aria-label="Bons en attente par étape de workflow">
      <thead>
        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground/70">
          <th scope="col" className="py-2 pr-2">Étape</th>
          <th scope="col" className="py-2 pr-2">Nombre</th>
          <th scope="col" className="py-2 pr-2">Ancienneté moyenne</th>
          <th scope="col" className="py-2">En retard</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {steps.map((step) => (
          <tr key={step.step}>
            <td className="py-2.5 pr-2 text-foreground/80">{step.label}</td>
            <td className="py-2.5 pr-2 tabular-nums text-foreground/80">{formatNumber(step.count)}</td>
            <td className="py-2.5 pr-2 tabular-nums text-foreground/80">{formatDays(step.avgAgeDays)}</td>
            <td
              className={cn(
                'py-2.5 tabular-nums font-medium',
                step.overdue > 0 ? 'text-destructive' : 'text-foreground/80',
              )}
            >
              {formatNumber(step.overdue)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
