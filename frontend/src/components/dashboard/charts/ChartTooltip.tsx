import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/kpi-format';

interface TooltipPayloadEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  /** Injectés par Recharts (`content={<ChartTooltip />}`). */
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  /** Mise en forme du titre (ex. libellé de bucket). Par défaut : `label` tel quel. */
  labelFormatter?: (label: string | number) => ReactNode;
  /** Mise en forme de chaque valeur. Par défaut : nombre en français. */
  valueFormatter?: (value: number, entry: TooltipPayloadEntry) => ReactNode;
  /** Masque le nom de série (graphiques à une seule série). */
  hideSeriesName?: boolean;
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Infobulle de graphique aux couleurs sémantiques du thème (`bg-popover`,
 * `text-popover-foreground`, `border-border`) : contrairement à l'infobulle par
 * défaut de Recharts (styles en ligne fond blanc / texte noir), elle suit le
 * thème sombre sans calcul de couleur.
 */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter, hideSeriesName }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const title = label === undefined || label === '' ? null : labelFormatter ? labelFormatter(label) : String(label);

  return (
    <div
      role="tooltip"
      className="min-w-[8rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
    >
      {title !== null && <p className="mb-1 font-medium text-muted-foreground">{title}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => {
          const value = toNumber(entry.value);
          const name = entry.name !== undefined ? String(entry.name) : '';
          return (
            <li key={`${String(entry.dataKey ?? name)}-${i}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                {entry.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />}
                {!hideSeriesName && name && <span>{name}</span>}
              </span>
              <span className="font-semibold tabular-nums">{valueFormatter ? valueFormatter(value, entry) : formatNumber(value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
