import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { refreshConfigHealth } from '@/hooks/use-config-health';
import type { ConfigCategory, ConnectionTestResponse } from '@/contracts/admin';
import { useConfigRegistry } from '@/pages/admin/configuration/useConfigRegistry';
import { FieldDef, InputField, SECRET_MASK, ToggleField } from './ConfigFields';
import { TestButton } from './ConfigTestButtons';

export type { FieldDef } from './ConfigFields';
export { SmtpTestButton, TestButton, type TestResult } from './ConfigTestButtons';

interface ConfigSectionProps {
  title: string;
  category: ConfigCategory;
  fields: FieldDef[];
  /** Reçoit les valeurs saisies (mêmes règles qu'à l'enregistrement : un
   *  secret non retapé n'y figure pas), pour tester ce que l'écran affiche. */
  onTest?: (typed: Readonly<Record<string, string>>) => Promise<ConnectionTestResponse>;
  testLabel?: string;
  footer?: React.ReactNode;
}

/** Valeurs à afficher : un secret enregistré reste masqué, jamais affiché. */
function displayedValues(fields: FieldDef[], data: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.encrypted && data[f.key] ? SECRET_MASK : (data[f.key] ?? '')]));
}

/** Valeurs à enregistrer : un secret non retapé (masque intact) ou vidé par
 *  erreur n'est jamais envoyé, pour ne pas écraser celui qui est en place. */
function valuesToSave(fields: FieldDef[], values: Record<string, string>, touched: ReadonlySet<string>): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((f) => {
        const val = values[f.key] ?? '';
        return !(f.encrypted && (val === '' || (val === SECRET_MASK && !touched.has(f.key))));
      })
      .map((f) => [f.key, values[f.key] ?? '']),
  );
}

function LoadingCard({ title, fields }: { title: string; fields: FieldDef[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.filter((f) => !f.toggle).map((f) => (
          <div key={f.key} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
          <p className="text-sm text-destructive">{message}</p>
          <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>Réessayer</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Une rubrique de l'écran Configuration : ses champs, la valeur que le
 * serveur applique quand rien n'est saisi (« Valeur appliquée : 3 (par
 * défaut) », lue dans le registre), l'enregistrement et, le cas échéant, le
 * test de connexion.
 */
export function ConfigSection({ title, category, fields, onTest, testLabel, footer }: ConfigSectionProps) {
  const registry = useConfigRegistry(category);
  const [values, setValues] = useState<Record<string, string>>({});
  // Secrets réellement retapés, par opposition à un simple focus sur le masque.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<Record<string, string | null>>(`/admin/config/${category}`)
      .then((data) => {
        setValues(displayedValues(fields, data));
        setTouched(new Set());
      })
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement de la configuration')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- les champs sont fixés par la page pour une rubrique : seul un changement de rubrique recharge.
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/config/${category}`, valuesToSave(fields, values, touched));
      toast({ title: 'Configuration enregistrée', variant: 'success' });
      // L'état de santé et les valeurs appliquées dépendent de ce qui vient d'être enregistré.
      refreshConfigHealth();
      await registry.reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingCard title={title} fields={fields} />;
  if (loadError) return <ErrorCard title={title} message={loadError} onRetry={load} />;

  const toggleFields = fields.filter((f) => f.toggle);
  const inputFields = fields.filter((f) => !f.toggle);

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {toggleFields.length > 0 && (
          <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:flex-wrap sm:gap-6">
            {toggleFields.map((f) => (
              <ToggleField key={f.key} field={f} value={values[f.key]} entry={registry.entries[f.key]} onChange={(v) => setValue(f.key, v)} />
            ))}
          </div>
        )}
        {inputFields.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inputFields.map((f) => (
              <InputField
                key={f.key}
                field={f}
                value={values[f.key] ?? ''}
                entry={registry.entries[f.key]}
                onChange={(v) => setValue(f.key, v)}
                onFocusSecret={(input) => input.select()}
              />
            ))}
          </div>
        )}
        {registry.error && <p className="text-xs text-muted-foreground">{registry.error}</p>}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <Button
            onClick={save}
            disabled={saving || saved}
            className={`min-h-11 sm:min-h-9 ${saved ? 'bg-success text-success-foreground hover:bg-success' : ''}`}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : saved ? <Check className="h-3 w-3" /> : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </Button>
          {onTest && testLabel && (
            <TestButton onTest={() => onTest(valuesToSave(fields, values, touched))} label={testLabel} />
          )}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
