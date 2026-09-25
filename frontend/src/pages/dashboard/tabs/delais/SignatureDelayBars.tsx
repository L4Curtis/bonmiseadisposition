import { HorizontalBars, type HorizontalBarsDatum } from '@/components/dashboard/charts/HorizontalBars';
import { formatHours, formatNumber, formatPercent } from '@/lib/kpi-format';
import type { SendToSignature, SendToSignatureMetric } from '../../types/delais';

const STEPS: Array<{ key: keyof SendToSignature; label: string }> = [
  { key: 'mise_disposition', label: 'Mise à disposition' },
  { key: 'restitution', label: 'Restitution' },
  { key: 'pv_cloture', label: 'PV de non-restitution' },
];

export interface SignatureDelayBarsProps {
  sendToSignature: SendToSignature;
}

/** Délai envoi → signature par type de flux : médiane en barres horizontales
 *  (HorizontalBars n'affiche qu'une seule valeur par ligne), détail — nombre,
 *  p90, part signée sous 48 h / 7 j — dans une table sous les barres. */
export function SignatureDelayBars({ sendToSignature }: SignatureDelayBarsProps) {
  const bars: HorizontalBarsDatum[] = STEPS.map(({ key, label }) => ({
    key,
    label,
    value: sendToSignature[key].medianHours ?? 0,
  }));

  return (
    <div className="space-y-4">
      <HorizontalBars data={bars} height={160} valueFormatter={formatHours} />
      <table className="w-full text-xs" aria-label="Délai d'envoi à la signature par type de bon">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground/70">
            <th scope="col" className="py-1.5 pr-2 font-medium">Type</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">Nombre</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">p90</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">&lt; 48 h</th>
            <th scope="col" className="py-1.5 font-medium">&lt; 7 j</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {STEPS.map(({ key, label }) => {
            const metric: SendToSignatureMetric = sendToSignature[key];
            return (
              <tr key={key}>
                <td className="py-1.5 pr-2 text-foreground/80">{label}</td>
                <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatNumber(metric.count)}</td>
                <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatHours(metric.p90Hours)}</td>
                <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatPercent(metric.within48h)}</td>
                <td className="py-1.5 tabular-nums text-foreground/80">{formatPercent(metric.within7d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
