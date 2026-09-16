import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartTheme } from './chart-theme';
import { formatNumber, formatPercent } from '@/lib/kpi-format';

export interface DonutChartDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutChartDatum[];
  height?: number;
}

/** Donut avec légende affichant valeur et part en pourcentage. */
export function DonutChart({ data, height = 220 }: DonutChartProps) {
  const theme = useChartTheme();
  const palette = theme.series;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="mx-auto w-full max-w-[220px] sm:mx-0">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="90%" paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={d.color ?? palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatNumber(typeof value === 'number' ? value : Number(value)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color ?? palette[i % palette.length] }}
                aria-hidden="true"
              />
              <span className="truncate text-foreground/80">{d.label}</span>
            </span>
            <span className="shrink-0 font-medium text-muted-foreground">
              {formatNumber(d.value)} ({formatPercent(total > 0 ? d.value / total : null)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
