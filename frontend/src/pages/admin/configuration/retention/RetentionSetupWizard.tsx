import { useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { refreshConfigHealth } from '@/hooks/use-config-health';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  RETENTION_DURATIONS,
  durationError,
  initialDurationValues,
  type RetentionDurationKey,
  type RetentionDurationValues,
} from './retention-durations';
import { isSimulationFresh, simulateRetention, type RetentionSimulation } from './retention-api';
import {
  RetentionActivateStep,
  RetentionDurationsStep,
  RetentionExplainStep,
  RetentionSimulateStep,
} from './RetentionWizardSteps';

const STEPS = [
  'Comprendre les durées',
  'Choisir les durées',
  'Simuler',
  'Activer',
] as const;

interface RetentionSetupWizardProps {
  /** Configuration `retention` actuellement enregistrée. */
  saved: Record<string, string>;
  /** Appelé une fois la rétention activée. */
  onActivated: () => void;
}

function sameValues(a: RetentionDurationValues, saved: Record<string, string>): boolean {
  return RETENTION_DURATIONS.every((d) => (saved[d.key] ?? '') === a[d.key].trim());
}

/**
 * Première configuration de la rétention RGPD (lot H4) : comprendre chaque
 * durée, choisir les valeurs, simuler, puis seulement activer.
 *
 * L'activation n'est proposée qu'avec des durées enregistrées, inchangées
 * depuis, et une simulation faite avec elles il y a moins de 24 h. La
 * simulation est un dry-run serveur : elle ne modifie aucune donnée.
 */
export function RetentionSetupWizard({ saved, onActivated }: RetentionSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [persistedValues, setPersistedValues] = useState<Record<string, string>>(saved);
  const [values, setValues] = useState<RetentionDurationValues>(() => initialDurationValues(saved));
  const [simulation, setSimulation] = useState<RetentionSimulation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'save' | 'simulate' | 'activate' | null>(null);

  const persisted = sameValues(values, persistedValues);
  const simulationValid = persisted && isSimulationFresh(simulation);
  const attachmentsUndercounted = Number(values.attachment_months) > Number(values.anonymize_months);

  const changeValue = (key: RetentionDurationKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (RETENTION_DURATIONS.some((d) => durationError(d, values[d.key]) !== null)) return;
    setBusy('save');
    try {
      const body = Object.fromEntries(RETENTION_DURATIONS.map((d) => [d.key, values[d.key].trim()]));
      await api.put('/admin/config/retention', body);
      setPersistedValues((prev) => ({ ...prev, ...body }));
      // De nouvelles durées rendent caduque toute simulation antérieure.
      setSimulation(null);
      toast({ title: 'Durées enregistrées', description: 'La rétention reste désactivée.', variant: 'success' });
      setStep(2);
    } catch (e: unknown) {
      showActionError(e, "Impossible d'enregistrer les durées");
    } finally {
      setBusy(null);
    }
  };

  const simulate = async () => {
    setBusy('simulate');
    try {
      setSimulation(await simulateRetention());
    } catch (e: unknown) {
      showActionError(e, 'Simulation impossible');
    } finally {
      setBusy(null);
    }
  };

  const activate = async () => {
    if (!simulationValid || !confirmed) return;
    setBusy('activate');
    try {
      await api.put('/admin/config/retention', { enabled: 'true' });
      refreshConfigHealth();
      toast({ title: 'Rétention activée', description: 'Première exécution dimanche à 3 h.', variant: 'success' });
      onActivated();
    } catch (e: unknown) {
      showActionError(e, "Impossible d'activer la rétention");
    } finally {
      setBusy(null);
    }
  };

  const canGoNext = step === 0 || (step === 1 && persisted) || (step === 2 && simulationValid);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rétention RGPD — première configuration</CardTitle>
        <p className="text-sm text-muted-foreground">
          La rétention n'est pas encore activée : rien n'est anonymisé ni supprimé automatiquement.
        </p>
        <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Étapes">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={`rounded-full border px-2.5 py-1 ${i === step ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground'}`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label={STEPS[step]}>
          <h2 className="mb-3 text-base font-semibold">{step + 1}. {STEPS[step]}</h2>
          {step === 0 && <RetentionExplainStep />}
          {step === 1 && (
            <RetentionDurationsStep
              values={values}
              onChange={changeValue}
              onSave={save}
              saving={busy === 'save'}
              persisted={persisted}
            />
          )}
          {step === 2 && (
            <RetentionSimulateStep
              simulation={simulationValid ? simulation : null}
              simulating={busy === 'simulate'}
              onSimulate={simulate}
              attachmentsUndercounted={attachmentsUndercounted}
            />
          )}
          {step === 3 && (
            <RetentionActivateStep
              values={values}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              canActivate={simulationValid}
              activating={busy === 'activate'}
              onActivate={activate}
            />
          )}
        </section>

        <div className="flex items-center justify-between border-t pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || busy !== null}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Button>
          {step < STEPS.length - 1 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext || busy !== null}>
              Suivant <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {step === 1 && !persisted && (
          <p className="text-xs text-muted-foreground">Enregistrez les durées pour passer à la simulation.</p>
        )}
        {step === 2 && !simulationValid && (
          <p className="text-xs text-muted-foreground">Lancez la simulation pour passer à l'activation.</p>
        )}
      </CardContent>
    </Card>
  );
}
