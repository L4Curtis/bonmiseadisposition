import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { refreshConfigHealth } from '@/hooks/use-config-health';
import { CheckCircle, XCircle, Loader2, Check } from 'lucide-react';

const SECRET_MASK = '••••••••';

export type TestResult = { success: boolean; message: string } | null;

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  encrypted?: boolean;
  toggle?: boolean;
  defaultValue?: string;
  /** Texte d'aide affiché sous le champ. */
  help?: string;
  min?: number;
  max?: number;
};

function Toggle({ checked, onChange, id, label }: { checked: boolean; onChange: (v: boolean) => void; id?: string; label?: string }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      // Nom accessible : sans lui, un lecteur d'écran annonce « bouton » sans
      // dire lequel, et la commande vocale ne peut pas le viser. Le libellé
      // visible est un <Label> voisin, que rien ne reliait au bouton.
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm ring-1 ring-black/5 transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function TestButton({ onTest, label }: { onTest: () => Promise<TestResult>; label: string }) {
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      setResult(await onTest());
    } catch (e: unknown) {
      // Un test qui échoue côté serveur (500/timeout) doit afficher l'erreur,
      // pas bloquer le spinner indéfiniment
      setResult({ success: false, message: e instanceof Error && e.message ? e.message : 'Échec du test' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
        {label}
      </Button>
      {result && (
        <span
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-success' : 'text-destructive'}`}
          role={result.success ? undefined : 'alert'}
        >
          {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}

export function SmtpTestButton({ onTest }: { onTest: (email: string) => Promise<TestResult> }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!email) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await onTest(email));
    } catch (e: unknown) {
      setResult({ success: false, message: e instanceof Error && e.message ? e.message : 'Échec du test' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-xs font-medium text-muted-foreground">Envoyer un email de test</p>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="adresse@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading || !email}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none mr-1" /> : null}
          Envoyer le test
        </Button>
      </div>
      {result && (
        <span
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-success' : 'text-destructive'}`}
          role={result.success ? undefined : 'alert'}
        >
          {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}

export function ConfigSection({
  title,
  category,
  fields,
  onTest,
  testLabel,
  footer,
}: {
  title: string;
  category: string;
  fields: FieldDef[];
  onTest?: () => Promise<TestResult>;
  testLabel?: string;
  footer?: React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  // Clés dont la valeur a été réellement modifiée par l'utilisateur (saisie),
  // par opposition à un simple focus sur le masque du secret.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<Record<string, string>>(`/admin/config/${category}`)
      .then((data) => {
        const masked: Record<string, string> = {};
        for (const f of fields) {
          const raw = data[f.key];
          if (f.encrypted && raw) {
            masked[f.key] = SECRET_MASK;
          } else {
            masked[f.key] = raw || f.defaultValue || '';
          }
        }
        setValues(masked);
        setTouched(new Set());
      })
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement de la configuration')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- les champs sont fixés par la page pour une catégorie : seul un changement de catégorie recharge.
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const toSave: Record<string, string> = {};
      for (const f of fields) {
        const val = values[f.key] ?? '';
        // Un champ chiffré non modifié (masque intact) ou vidé par erreur
        // (focus + Enregistrer sans saisie) ne doit jamais écraser le secret
        // existant côté serveur.
        if (f.encrypted && (val === '' || (val === SECRET_MASK && !touched.has(f.key)))) {
          continue;
        }
        toSave[f.key] = val;
      }
      await api.put(`/admin/config/${category}`, toSave);
      toast({ title: 'Configuration enregistrée', variant: 'success' });
      // L'enregistrement peut changer l'état de santé de cette rubrique (et de
      // « Monitoring SMB », qui reprend l'état de « smb ») : la carte de
      // synthèse et les pastilles du menu déjà montées se mettent à jour sans
      // attendre un remontage.
      refreshConfigHealth();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const toggleFields = fields.filter((f) => f.toggle);
  const inputFields = fields.filter((f) => !f.toggle);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inputFields.map((f) => (
              <div key={f.key} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {toggleFields.length > 0 && (
          <div className="flex flex-wrap gap-6 pb-2">
            {toggleFields.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <Toggle
                  id={f.key}
                  label={f.label}
                  checked={values[f.key] === 'true'}
                  onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v ? 'true' : 'false' }))}
                />
                <Label htmlFor={f.key} className="cursor-pointer select-none">{f.label}</Label>
              </div>
            ))}
          </div>
        )}

        {inputFields.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inputFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                  value={values[f.key] || ''}
                  onChange={(e) => {
                    const next = e.target.value;
                    setValues((v) => ({ ...v, [f.key]: next }));
                    setTouched((t) => (t.has(f.key) ? t : new Set(t).add(f.key)));
                  }}
                  onFocus={(e) => {
                    // Ne jamais effacer le masque au focus : on sélectionne le
                    // texte pour que la première frappe le remplace naturellement,
                    // sans risquer d'enregistrer un secret vidé par erreur.
                    if (f.encrypted && e.target.value === SECRET_MASK) {
                      e.target.select();
                    }
                  }}
                />
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={save}
            disabled={saving || saved}
            size="sm"
            className={saved ? 'bg-success hover:bg-success text-success-foreground' : ''}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : saved ? <Check className="h-3 w-3" /> : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </Button>
          {onTest && testLabel && (
            <TestButton onTest={onTest} label={testLabel} />
          )}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
