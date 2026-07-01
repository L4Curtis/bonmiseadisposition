import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Loader2, Check } from 'lucide-react';

export type TestResult = { success: boolean; message: string } | null;

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  encrypted?: boolean;
  toggle?: boolean;
  defaultValue?: string;
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${
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
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}
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
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<Record<string, string>>(`/admin/config/${category}`).then((data) => {
      const masked: Record<string, string> = {};
      for (const f of fields) {
        const raw = data[f.key];
        if (f.encrypted && raw) {
          masked[f.key] = '••••••••';
        } else {
          masked[f.key] = raw || f.defaultValue || '';
        }
      }
      setValues(masked);
      setLoaded(true);
    });
  }, [category]);

  const save = async () => {
    setSaving(true);
    try {
      const toSave: Record<string, string> = {};
      for (const f of fields) {
        if (values[f.key] !== '••••••••') {
          toSave[f.key] = values[f.key] || '';
        }
      }
      await api.put(`/admin/config/${category}`, toSave);
      toast({ title: 'Configuration enregistrée', variant: 'success' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleFields = fields.filter((f) => f.toggle);
  const inputFields = fields.filter((f) => !f.toggle);

  if (!loaded) {
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
                  checked={values[f.key] === 'true'}
                  onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v ? 'true' : 'false' }))}
                />
                <Label className="cursor-pointer select-none">{f.label}</Label>
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
                  value={values[f.key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onFocus={(e) => {
                    if (f.encrypted && e.target.value === '••••••••') {
                      setValues((v) => ({ ...v, [f.key]: '' }));
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={save}
            disabled={saving || saved}
            size="sm"
            className={saved ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
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
