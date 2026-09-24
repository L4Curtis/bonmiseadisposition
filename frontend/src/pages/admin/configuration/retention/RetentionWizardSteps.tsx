import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Eye, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  RETENTION_DURATIONS,
  durationError,
  type RetentionDurationKey,
  type RetentionDurationValues,
} from './retention-durations';
import type { RetentionSimulation } from './retention-api';
import { RetentionSimulationSummary } from './RetentionSimulationSummary';

// ─── Étape 1 : comprendre ────────────────────────────────────────────────────

export function RetentionExplainStep() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        La rétention s'exécute chaque dimanche à 3 h une fois activée. Chaque durée ci-dessous agit sur une donnée
        précise ; les valeurs proposées sont celles que le serveur applique déjà quand rien n'est enregistré.
        Faites-les valider par le référent RGPD avant l'activation.
      </p>
      <ul className="space-y-3">
        {RETENTION_DURATIONS.map((d) => (
          <li key={d.key} className="rounded-lg border p-3 text-sm">
            <p className="font-medium text-foreground">
              {d.label} — valeur proposée : {d.suggested} {d.unit}
            </p>
            <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Ce qu'elle fait :</span> {d.effect}</p>
            <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Données touchées :</span> {d.data}</p>
            <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Pourquoi {d.suggested} {d.unit} :</span> {d.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Étape 2 : choisir les durées ────────────────────────────────────────────

interface DurationsStepProps {
  values: RetentionDurationValues;
  onChange: (key: RetentionDurationKey, value: string) => void;
  onSave: () => void;
  saving: boolean;
  /** Les valeurs affichées sont exactement celles enregistrées. */
  persisted: boolean;
}

export function RetentionDurationsStep({ values, onChange, onSave, saving, persisted }: DurationsStepProps) {
  const hasErrors = RETENTION_DURATIONS.some((d) => durationError(d, values[d.key]) !== null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {RETENTION_DURATIONS.map((d) => {
          const error = durationError(d, values[d.key]);
          const id = `retention-${d.key}`;
          return (
            <div key={d.key} className="space-y-1">
              <Label htmlFor={id}>{d.label} ({d.unit})</Label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={d.min}
                max={d.max}
                value={values[d.key]}
                onChange={(e) => onChange(d.key, e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={`${id}-help`}
              />
              <p id={`${id}-help`} className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
                {error ?? `Proposé : ${d.suggested} ${d.unit}.`}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={onSave} disabled={saving || hasErrors || persisted}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Save className="h-3.5 w-3.5" />}
          Enregistrer ces durées
        </Button>
        <span className="text-xs text-muted-foreground">
          {persisted
            ? 'Durées enregistrées. La rétention reste désactivée tant que vous ne l’activez pas.'
            : 'L’enregistrement n’active rien : il permet de simuler avec ces durées.'}
        </span>
      </div>
    </div>
  );
}

// ─── Étape 3 : simuler ───────────────────────────────────────────────────────

interface SimulateStepProps {
  simulation: RetentionSimulation | null;
  simulating: boolean;
  onSimulate: () => void;
  attachmentsUndercounted: boolean;
}

export function RetentionSimulateStep({ simulation, simulating, onSimulate, attachmentsUndercounted }: SimulateStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        La simulation compte ce que la rétention toucherait aujourd'hui avec les durées enregistrées, sans rien
        supprimer ni anonymiser.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onSimulate} disabled={simulating}>
        {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Eye className="h-3.5 w-3.5" />}
        {simulation ? 'Relancer la simulation' : 'Lancer la simulation'}
      </Button>
      {simulation && (
        <RetentionSimulationSummary simulation={simulation} attachmentsUndercounted={attachmentsUndercounted} />
      )}
    </div>
  );
}

// ─── Étape 4 : activer ───────────────────────────────────────────────────────

interface ActivateStepProps {
  values: RetentionDurationValues;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  canActivate: boolean;
  activating: boolean;
  onActivate: () => void;
}

export function RetentionActivateStep({
  values, confirmed, onConfirmedChange, canActivate, activating, onActivate,
}: ActivateStepProps) {
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {RETENTION_DURATIONS.map((d) => (
          <li key={d.key}>
            <span className="text-muted-foreground">{d.label} :</span>{' '}
            <strong className="text-foreground">{values[d.key]} {d.unit}</strong>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Une fois activée, l'anonymisation s'exécute chaque dimanche à 3 h sans nouvelle confirmation. Les données
          anonymisées ou supprimées ne peuvent pas être restaurées.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        Ces durées ont été validées avec le référent RGPD.
      </label>
      <Button type="button" size="sm" onClick={onActivate} disabled={!canActivate || !confirmed || activating}>
        {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        Activer la rétention automatique
      </Button>
    </div>
  );
}
