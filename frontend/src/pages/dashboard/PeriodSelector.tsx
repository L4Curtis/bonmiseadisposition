import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PRESETS, PRESET_LABELS, type DateRange, type Preset } from '@/lib/kpi-period';

export interface PeriodSelectorProps {
  preset: Preset | null;
  from: string;
  to: string;
  onPresetChange: (preset: Preset) => void;
  onRangeChange: (range: DateRange) => void;
  className?: string;
}

/** Sélecteur de période : presets 7 j / 30 j / 90 j / 12 mois + « Personnalisé »
 *  (deux dates). Le preset actif est détecté depuis l'URL (`preset`, calculé
 *  par usePeriodParams via detectPreset) ; « Personnalisé » peut aussi être
 *  ouvert manuellement même si la plage courante correspond encore à un preset. */
export function PeriodSelector({ preset, from, to, onPresetChange, onRangeChange, className }: PeriodSelectorProps) {
  const [manualCustom, setManualCustom] = useState(false);
  const isCustom = preset === null || manualCustom;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {PRESETS.map((p) => {
          const active = !isCustom && preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => { setManualCustom(false); onPresetChange(p); }}
              aria-pressed={active}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setManualCustom(true)}
          aria-pressed={isCustom}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            isCustom ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Personnalisé
        </button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Date de début"
            value={from}
            max={to}
            onChange={(e) => onRangeChange({ from: e.target.value, to })}
            className="h-8 w-[9.5rem] text-xs"
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>
          <Input
            type="date"
            aria-label="Date de fin"
            value={to}
            min={from}
            onChange={(e) => onRangeChange({ from, to: e.target.value })}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
      )}
    </div>
  );
}
