import { useId, useState, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowRight, ArrowUp, HelpCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { computeDelta, formatDays, formatHours, formatNumber, formatPercent } from '@/lib/kpi-format';
import { unitWord, type Unit } from '../lib/kpi-scope';

export type KpiCardFormat = 'number' | 'percent' | 'days' | 'hours';
export type KpiCardTone = 'default' | 'danger' | 'warning';

export interface KpiCardDelta {
  current: number;
  previous: number | null;
  /** Une baisse est une amélioration (retards, annulations…). */
  invert?: boolean;
}

export interface KpiCardProps {
  /** Ce que compte le chiffre (« Retour en retard »), jamais tronqué. */
  label: string;
  value: number | null;
  icon: ElementType;
  format?: KpiCardFormat;
  /** Unité écrite après le chiffre (« 6 équipements »), pour `format: 'number'`. */
  unit?: Unit;
  /** Portée : « au 25/09 » (état du jour) ou « du 27/08 au 25/09 » (flux). */
  scope?: string;
  /** Précision sous le chiffre (« sur 3 bons », « depuis plus de 7 jours »). */
  detail?: ReactNode;
  /** Comparaison à la période précédente : flux seulement. */
  delta?: KpiCardDelta;
  tone?: KpiCardTone;
  /** Liste qui justifie le chiffre ; la carte entière devient un lien. */
  href?: string;
  /** Définition complète, dépliée par le bouton « ? ». */
  definition?: string;
  loading?: boolean;
  className?: string;
}

const FORMATTERS: Record<KpiCardFormat, (value: number | null) => string> = {
  number: formatNumber,
  percent: formatPercent,
  days: formatDays,
  hours: formatHours,
};

const TONE_VALUE: Record<KpiCardTone, string> = {
  default: 'text-foreground',
  danger: 'text-destructive',
  warning: 'text-warning',
};

const TONE_ICON: Record<KpiCardTone, string> = {
  default: 'border-border text-muted-foreground',
  danger: 'border-destructive/30 text-destructive',
  warning: 'border-warning/30 text-warning',
};

const pctFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border/80 bg-card p-3 sm:p-5', className)}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-3 h-3 w-24" />
    </div>
  );
}

function DeltaLine({ delta }: { delta: KpiCardDelta }) {
  const { pct, direction } = computeDelta(delta.current, delta.previous);
  if (pct === null) {
    const text = delta.previous === 0 ? 'contre 0 sur la période précédente' : 'pas de période précédente comparable';
    return <p className="text-[11px] text-muted-foreground/70">{text}</p>;
  }
  const improved = delta.invert ? direction === 'down' : direction === 'up';
  const color = direction === 'flat' ? 'text-muted-foreground/70' : improved ? 'text-success' : 'text-destructive';
  const Arrow = direction === 'down' ? ArrowDown : ArrowUp;
  return (
    <p className={cn('flex items-center gap-1 text-[11px] font-medium', color)}>
      {direction !== 'flat' && <Arrow className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {`${pct > 0 ? '+' : ''}${pctFormatter.format(pct)} % vs période précédente`}
    </p>
  );
}

function CardBody({ label, value, icon: Icon, format = 'number', unit, scope, detail, delta, tone = 'default', href }: KpiCardProps) {
  const formatted = FORMATTERS[format](value);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* Titre sur plusieurs lignes plutôt que coupé ; interligne normal pour
            ne pas rogner les accents des capitales (« É »). */}
        <p className="min-w-0 break-words pr-6 text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
        <span className={cn('hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:flex', TONE_ICON[tone])}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn('text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-[28px]', TONE_VALUE[tone])}>
          {formatted}
        </span>
        {unit && format === 'number' && value !== null && (
          <span className="text-sm font-medium text-muted-foreground">{unitWord(value, unit)}</span>
        )}
      </p>
      <div className="mt-2 space-y-0.5">
        {detail && <p className="text-[11px] font-medium leading-snug text-muted-foreground">{detail}</p>}
        {delta && <DeltaLine delta={delta} />}
        {scope && <p className="text-[11px] leading-snug text-muted-foreground/70">{scope}</p>}
      </div>
      {href && (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
          Voir la liste
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </p>
      )}
    </>
  );
}

/**
 * Carte d'indicateur du tableau de bord : le chiffre avec son unité, sa portée
 * (état du jour ou période), et, quand une liste le justifie, un lien vers
 * cette liste (la carte entière est cliquable, au clavier comme au doigt).
 */
export function KpiCard(props: KpiCardProps) {
  const { label, value, format = 'number', unit, href, definition, loading, className } = props;
  const [showDefinition, setShowDefinition] = useState(false);
  const definitionId = useId();
  if (loading) return <KpiCardSkeleton className={className} />;

  const unitText = unit && format === 'number' && value !== null ? ` ${unitWord(value, unit)}` : '';
  const ariaLabel = `${label} : ${FORMATTERS[format](value)}${unitText}${props.scope ? `, ${props.scope}` : ''}`;
  const frame = 'relative rounded-lg border border-border/80 bg-card card-elevated';

  return (
    <div className={cn(frame, href && 'transition-colors hover:border-primary/40', className)}>
      {href ? (
        <Link to={href} aria-label={`${ariaLabel}. Voir la liste`} className="block min-h-[44px] rounded-lg p-3 sm:p-5">
          <CardBody {...props} />
        </Link>
      ) : (
        <div aria-label={ariaLabel} className="p-3 sm:p-5">
          <CardBody {...props} />
        </div>
      )}
      {definition && (
        <>
          <button
            type="button"
            onClick={() => setShowDefinition((v) => !v)}
            aria-expanded={showDefinition}
            aria-controls={definitionId}
            aria-label={`Définition : ${label}`}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground sm:right-11"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
          {showDefinition && (
            <p id={definitionId} className="border-t border-border/60 px-3 py-2 text-xs leading-snug text-muted-foreground sm:px-5">
              {definition}
            </p>
          )}
        </>
      )}
    </div>
  );
}
