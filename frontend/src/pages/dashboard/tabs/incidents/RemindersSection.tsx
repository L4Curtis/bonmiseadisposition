import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BellRing, Repeat } from 'lucide-react';
import { KpiCard } from '../../components/KpiCard';
import { UNITS } from '../../lib/kpi-scope';
import { useChartTheme } from '@/components/dashboard/charts/chart-theme';
import { ChartTooltip } from '@/components/dashboard/charts/ChartTooltip';
import { formatNumber } from '@/lib/kpi-format';
import type { Reminders } from '../../types/incidents';

export interface RemindersSectionProps {
  reminders: Reminders;
  /** « du 27/08 au 25/09 ». */
  scope: string;
}

function rankLabel(rank: number): string {
  return rank === 1 ? '1er rappel' : `${rank}e rappel`;
}

/** Rappels envoyés sur la période, par rang (chaque document reçoit au plus
 *  trois rappels, comptés depuis sa demande de signature) : barres « envoyés »
 *  et « suivis d'une signature », valeurs exactes dessous, et deux cartes de
 *  synthèse. N'est affiché que si au moins un rappel est parti. */
export function RemindersSection({ reminders, scope }: RemindersSectionProps) {
  const theme = useChartTheme();
  const chartData = reminders.byRank.map((r) => ({
    key: `rank-${r.rank}`,
    label: rankLabel(r.rank),
    sent: r.sent.current,
    signedAfter: r.signedAfter.current,
  }));
  const firstRank = reminders.byRank[0] ?? null;

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
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
            width={90}
            tick={{ fill: theme.mutedForeground, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: theme.muted }} content={<ChartTooltip />} />
          <Bar dataKey="sent" name="Envoyés" fill={theme.chart1} radius={[0, 4, 4, 0]} />
          <Bar dataKey="signedAfter" name="Suivis d'une signature" fill={theme.chart2} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {reminders.byRank.map((r) => (
          <li key={r.rank} className="rounded-md border border-border/60 px-3 py-2 text-xs">
            <p className="mb-1.5 font-medium text-foreground/80">{rankLabel(r.rank)}</p>
            <p className="flex items-center justify-between text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: theme.chart1 }} aria-hidden="true" />
                Envoyés
              </span>
              <span className="font-medium text-foreground/80">{formatNumber(r.sent.current)}</span>
            </p>
            <p className="mt-1 flex items-center justify-between text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: theme.chart2 }} aria-hidden="true" />
                Suivis d&apos;une signature
              </span>
              <span className="font-medium text-foreground/80">{formatNumber(r.signedAfter.current)}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <KpiCard
          label="Documents signés après le 1er rappel" value={firstRank?.efficiency ?? null} format="percent"
          icon={BellRing} scope={scope}
          detail={firstRank ? `${firstRank.signedAfter.current} sur ${firstRank.sent.current} premiers rappels` : undefined}
          definition="Part des premiers rappels suivis de la signature du document rappelé, sans autre rappel entre-temps."
        />
        <KpiCard
          label="Documents ayant reçu 3 rappels" value={reminders.documentsWithThreeOrMore.current} unit={UNITS.documents}
          icon={Repeat} scope={scope} delta={{ ...reminders.documentsWithThreeOrMore, invert: true }}
          definition="Documents (remise, restitution ou PV d'un bon) dont le troisième et dernier rappel est parti sur la période : le collaborateur ne sera plus relancé automatiquement."
        />
      </div>
    </div>
  );
}
