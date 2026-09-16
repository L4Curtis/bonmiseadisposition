import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from './chart-theme';
import { formatNumber } from '@/lib/kpi-format';

export type Granularity = 'day' | 'week' | 'month';

export interface TimeSeriesDatum {
  bucket: string;
  [key: string]: number | string;
}

export interface TimeSeriesSeries {
  key: string;
  label: string;
  color?: string;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesDatum[];
  series: TimeSeriesSeries[];
  granularity: Granularity;
  height?: number;
}

/** Numéro de semaine ISO-8601 (lundi = début de semaine, semaine 1 = celle
 *  contenant le premier jeudi de l'année). */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi de la semaine courante
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const diffMs = d.getTime() - firstThursday.getTime();
  return 1 + Math.round(diffMs / (7 * 86_400_000));
}

/** Formate le libellé d'un bucket (`YYYY-MM-DD`, début de la période) en
 *  français selon la granularité : jour « 16 sept. », semaine « S38 », mois
 *  « sept. 2026 ». */
export function formatBucketLabel(bucket: string, granularity: Granularity): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;

  if (granularity === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
  if (granularity === 'week') {
    return `S${isoWeekNumber(date)}`;
  }
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** Courbe temporelle multi-séries (parc prêté, volumes de bons…). */
export function TimeSeriesChart({ data, series, granularity, height = 280 }: TimeSeriesChartProps) {
  const theme = useChartTheme();
  const palette = theme.series;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
          tick={{ fill: theme.mutedForeground, fontSize: 11 }}
          axisLine={{ stroke: theme.border }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: theme.mutedForeground, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={(label) => formatBucketLabel(String(label), granularity)}
          formatter={(value, name) => [formatNumber(typeof value === 'number' ? value : Number(value)), String(name)]}
          contentStyle={{ borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => {
          const color = s.color ?? palette[i % palette.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
