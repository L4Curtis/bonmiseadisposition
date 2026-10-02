import { useCallback, useEffect, useState } from 'react';
import { ConfigSection } from '@/components/admin/ConfigSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { RetentionSetupWizard } from './retention/RetentionSetupWizard';
import { RetentionActions, TechnicalPurgeActions } from './retention/RetentionManualActions';
import { ANONYMIZE_MONTHS_FLOOR, RETENTION_DURATIONS, type RetentionDurationDef } from './retention/retention-durations';

function ManualActions() {
  return (
    <>
      <RetentionActions />
      <TechnicalPurgeActions />
    </>
  );
}

/** Tant que la rétention n'est pas activée : parcours guidé de première
 *  configuration (lot H4), puis actions manuelles repliées. */
function FirstSetup({ saved, onActivated }: { saved: Record<string, string>; onActivated: () => void }) {
  return (
    <div className="space-y-4">
      <RetentionSetupWizard saved={saved} onActivated={onActivated} />
      <Card>
        <CardContent className="pt-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium">Actions manuelles (simulation, anonymisation, purge technique)</summary>
            <ManualActions />
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

/** Rétention active : réglages courants et actions manuelles. */
/** Bornes d'une durée, les mêmes que celles du serveur (registre de configuration). */
function boundsHelp(d: RetentionDurationDef): string {
  const legal = d.key === 'anonymize_months' ? ` (minimum légal : ${ANONYMIZE_MONTHS_FLOOR} mois)` : '';
  return `Entre ${d.min} et ${d.max} ${d.unit}${legal}.`;
}

function ActiveRetention() {
  return (
    <ConfigSection
      title="Rétention RGPD"
      category="retention"
      fields={[
        { key: 'enabled', label: 'Anonymisation automatique (cron hebdomadaire)', toggle: true },
        ...RETENTION_DURATIONS.map((d) => ({
          key: d.key,
          label: `${d.label} (${d.unit})`,
          type: 'number',
          min: d.min,
          max: d.max,
          help: boundsHelp(d),
        })),
      ]}
      footer={<ManualActions />}
    />
  );
}

export function ConfigRetentionPage() {
  const [config, setConfig] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setConfig(null);
    api.get<Record<string, string>>('/admin/config/retention')
      .then(setConfig)
      .catch((e: unknown) => setError(errorMessage(e, 'Erreur lors du chargement de la configuration')));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {/* Lot F1 : titre de page caché, cf. ConfigLdapPage. */}
      <h1 className="sr-only">Configuration — Rétention RGPD</h1>
      {error ? (
        <Card>
          <CardHeader><CardTitle>Rétention RGPD</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>Réessayer</Button>
            </div>
          </CardContent>
        </Card>
      ) : !config ? (
        <Card>
          <CardHeader><CardTitle>Rétention RGPD</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : config.enabled === 'true' ? (
        <ActiveRetention />
      ) : (
        <FirstSetup saved={config} onActivated={load} />
      )}
    </>
  );
}
