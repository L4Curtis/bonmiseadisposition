import type { QuickView } from './quickViews';

export interface QuickViewsBarProps {
  readonly views: readonly QuickView[];
  readonly activeViewId: string | undefined;
  readonly onSelect: (view: QuickView) => void;
}

/** Raccourcis de filtres prêts à l'emploi. Un clic remplace les filtres en
 *  cours par ceux de la vue ; la vue active est signalée (aria-pressed). */
export function QuickViewsBar({ views, activeViewId, onSelect }: QuickViewsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vues rapides">
      <span className="text-xs font-medium text-muted-foreground">Vues rapides :</span>
      {views.map((v) => {
        const active = v.id === activeViewId;
        return (
          <button
            key={v.id}
            type="button"
            aria-pressed={active}
            title={v.description}
            onClick={() => onSelect(v)}
            className={
              active
                ? 'rounded-full border border-[hsl(var(--primary)/0.60)] bg-[hsl(var(--primary)/0.10)] px-3 py-1 text-xs font-medium text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
