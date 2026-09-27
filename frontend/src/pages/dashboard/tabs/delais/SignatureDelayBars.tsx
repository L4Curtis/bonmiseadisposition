import { formatHours, formatNumber, formatPercent } from '@/lib/kpi-format';

/** Délai lisible : minutes sous une heure, puis heures, puis jours au-delà de 48 h. */
function formatDelay(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return hours * 60 < 1 ? 'moins d’1 min' : `${Math.round(hours * 60)} min`;
  return formatHours(hours);
}
import type { SendToSignature, SendToSignatureMetric } from '../../types/delais';

const STEPS: Array<{ key: keyof SendToSignature; label: string }> = [
  { key: 'mise_disposition', label: 'Remise' },
  { key: 'restitution', label: 'Restitution' },
  { key: 'pv_cloture', label: 'PV de non-restitution' },
];

export interface SignatureDelayBarsProps {
  sendToSignature: SendToSignature;
}

/** « 86 % (6 sur 7) » : une part n'a de sens qu'avec son effectif. */
function shareWithCount(ratio: number | null, count: number): string {
  if (ratio === null || count === 0) return '—';
  return `${formatPercent(ratio)} (${Math.round(ratio * count)} sur ${count})`;
}

/**
 * Délai entre la demande de signature et la signature, par document. Les
 * barres tracent le délai médian — la même valeur que la colonne « Délai
 * médian » du tableau —, à l'échelle de la plus longue, avec la valeur écrite
 * en heures (ou en jours au-delà de 48 h).
 */
export function SignatureDelayBars({ sendToSignature }: SignatureDelayBarsProps) {
  const max = Math.max(...STEPS.map(({ key }) => sendToSignature[key].medianHours ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Délai médian : la moitié des documents sont signés plus vite. Unité : minutes, heures, puis jours au-delà de 48 h.
      </p>
      <ul className="space-y-2.5" aria-label="Délai médian par document">
        {STEPS.map(({ key, label }) => {
          const median = sendToSignature[key].medianHours;
          const width = median && max > 0 ? Math.max(2, Math.round((median / max) * 100)) : 0;
          return (
            <li key={key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-foreground/80">{label}</span>
                <span className="tabular-nums text-muted-foreground">{formatDelay(median)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs" aria-label="Délai entre la demande et la signature, par document">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 font-medium">Document</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Signatures</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Délai médian</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">9 sur 10 signés en moins de</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Signés sous 48 h</th>
              <th scope="col" className="py-1.5 font-medium">Signés sous 7 jours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {STEPS.map(({ key, label }) => {
              const metric: SendToSignatureMetric = sendToSignature[key];
              return (
                <tr key={key}>
                  <td className="py-1.5 pr-2 text-foreground/80">{label}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatNumber(metric.count)}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatDelay(metric.medianHours)}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{formatDelay(metric.p90Hours)}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-foreground/80">{shareWithCount(metric.within48h, metric.count)}</td>
                  <td className="py-1.5 tabular-nums text-foreground/80">{shareWithCount(metric.within7d, metric.count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
