import type { ElementType, ReactNode } from 'react';
import { ArrowRight, ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDays, formatHours, formatNumber, formatPercent, computeDelta } from '@/lib/kpi-format';

export type StatCardFormat = 'number' | 'percent' | 'days' | 'hours';
export type StatCardTone = 'default' | 'danger' | 'warning';

export interface StatCardDelta {
  current: number;
  previous: number | null;
  /** Inverse le sens de l'amélioration (ex. un nombre de retards qui baisse est une amélioration). */
  invert?: boolean;
}

export interface StatCardProps {
  label: string;
  value: number | null;
  icon: ElementType;
  format?: StatCardFormat;
  delta?: StatCardDelta;
  hint?: ReactNode;
  tone?: StatCardTone;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

const FORMATTERS: Record<StatCardFormat, (value: number | null) => string> = {
  number: formatNumber,
  percent: formatPercent,
  days: formatDays,
  hours: formatHours,
};

const TONE_ICON_CLASSES: Record<StatCardTone, string> = {
  default: 'border border-border text-muted-foreground',
  danger: 'border border-destructive/30 text-destructive',
  warning: 'border border-amber-500/30 text-amber-600 dark:text-amber-400',
};

const TONE_VALUE_CLASSES: Record<StatCardTone, string> = {
  default: 'text-foreground',
  danger: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
};

const pctFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative rounded-lg border border-border/80 bg-card p-5 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

function DeltaLine({ delta }: { delta: StatCardDelta }) {
  const { pct, direction } = computeDelta(delta.current, delta.previous);

  if (pct === null) {
    return <p className="mt-3 text-[11px] font-medium text-muted-foreground/70">—</p>;
  }

  const improved = delta.invert ? direction === 'down' : direction === 'up';
  const colorClass = direction === 'flat'
    ? 'text-muted-foreground/70'
    : improved
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
  const sign = pct > 0 ? '+' : '';
  const Arrow = direction === 'down' ? ArrowDown : ArrowUp;

  return (
    <p className={cn('mt-3 flex items-center gap-1 text-[11px] font-medium', colorClass)}>
      {direction !== 'flat' && <Arrow className="h-3 w-3" aria-hidden="true" />}
      {`${sign}${pctFormatter.format(pct)} % vs période précédente`}
    </p>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  format = 'number',
  delta,
  hint,
  tone = 'default',
  onClick,
  loading,
  className,
}: StatCardProps) {
  if (loading) return <StatCardSkeleton className={className} />;

  const formatted = FORMATTERS[format](value);
  const ariaLabel = `${label} : ${formatted}`;

  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="mb-3 truncate text-[13px] font-medium leading-none text-muted-foreground">{label}</p>
          <p className={cn('text-[28px] font-semibold leading-none tracking-tighter tabular-nums', TONE_VALUE_CLASSES[tone])}>
            {formatted}
          </p>
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200', onClick && 'group-hover:scale-105', TONE_ICON_CLASSES[tone])}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </div>
      </div>

      {delta ? (
        <DeltaLine delta={delta} />
      ) : hint ? (
        <p className="mt-3 text-[11px] font-medium text-muted-foreground/70">{hint}</p>
      ) : null}

      {onClick && (
        <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/80">
          Voir le détail
          <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          'group w-full rounded-lg border border-border/80 bg-card p-5 text-left card-elevated transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30',
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div aria-label={ariaLabel} className={cn('rounded-lg border border-border/80 bg-card p-5 card-elevated', className)}>
      {body}
    </div>
  );
}
