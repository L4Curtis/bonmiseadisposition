import { cn } from '@/lib/utils';

export interface BreakdownBarsRow {
  key: string;
  label: string;
  count: number;
  onClick?: () => void;
}

export interface BreakdownBarsProps {
  rows: BreakdownBarsRow[];
  emptyMessage?: string;
  className?: string;
}

/** Barres de répartition (parc par filiale, statuts, motifs…) — remplace les
 *  implémentations dupliquées de la page Reporting et du tableau de bord IT
 *  d'origine. */
export function BreakdownBars({ rows, emptyMessage = 'Aucune donnée disponible', className }: BreakdownBarsProps) {
  if (rows.length === 0) {
    return <p className={cn('py-8 text-center text-xs text-muted-foreground/70', className)}>{emptyMessage}</p>;
  }

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className={cn('divide-y divide-border', className)}>
      {rows.map((row) => {
        const pct = Math.round((row.count / max) * 100);
        const inner = (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="truncate pr-2 text-sm font-medium text-foreground/80">{row.label}</span>
              <span className="inline-flex min-w-[2rem] shrink-0 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground/80">
                {row.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: 'var(--gradient-primary)' }}
              />
            </div>
          </>
        );

        if (row.onClick) {
          return (
            <button
              key={row.key}
              type="button"
              onClick={row.onClick}
              className="w-full px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              {inner}
            </button>
          );
        }

        return (
          <div key={row.key} className="px-5 py-3.5">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
