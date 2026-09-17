import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from './chart-theme';
import { ChartTooltip } from './ChartTooltip';
import { formatNumber } from '@/lib/kpi-format';

export interface HorizontalBarsDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface HorizontalBarsProps {
  data: HorizontalBarsDatum[];
  height?: number;
  valueFormatter?: (value: number) => string;
}

/** Barres horizontales (top modèles, étapes en attente…) — libellés en français. */
export function HorizontalBars({ data, height = 280, valueFormatter = formatNumber }: HorizontalBarsProps) {
  const theme = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: theme.mutedForeground, fontSize: 11 }}
          axisLine={{ stroke: theme.border }}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fill: theme.mutedForeground, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: theme.muted }}
          content={<ChartTooltip hideSeriesName valueFormatter={(value) => valueFormatter(value)} />}
        />
        <Bar dataKey="value" fill={theme.chart1} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
