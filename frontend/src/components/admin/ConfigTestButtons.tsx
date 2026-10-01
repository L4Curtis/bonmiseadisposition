import { useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ConnectionTestResponse } from '@/contracts/admin';

/** Résultat d'un test de connexion : `{ ok, message }`, ou rien tant qu'il n'a pas tourné. */
export type TestResult = ConnectionTestResponse | null;

/** Un test qui n'aboutit pas côté serveur (500, délai) affiche l'erreur au
 *  lieu de laisser tourner l'indicateur indéfiniment. */
async function runTest(onTest: () => Promise<ConnectionTestResponse>): Promise<ConnectionTestResponse> {
  try {
    return await onTest();
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error && e.message ? e.message : 'Échec du test' };
  }
}

export function TestResultLine({ result }: { result: TestResult }) {
  if (!result) return null;
  return (
    <span
      className={`flex items-start gap-1 text-sm ${result.ok ? 'text-success' : 'text-destructive'}`}
      role={result.ok ? 'status' : 'alert'}
    >
      {result.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0 break-words">{result.message}</span>
    </span>
  );
}

/** Bouton « Tester la connexion » d'une rubrique. */
export function TestButton({ onTest, label }: { onTest: () => Promise<ConnectionTestResponse>; label: string }) {
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setResult(await runTest(onTest));
    setLoading(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
        {label}
      </Button>
      <TestResultLine result={result} />
    </div>
  );
}

/** Envoi d'un vrai email de test, à l'adresse saisie. */
export function SmtpTestButton({ onTest }: { onTest: (email: string) => Promise<ConnectionTestResponse> }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!email) return;
    setLoading(true);
    setResult(null);
    setResult(await runTest(() => onTest(email)));
    setLoading(false);
  };

  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs font-medium text-muted-foreground">Envoyer un email de test</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="email"
          aria-label="Adresse qui recevra l’email de test"
          placeholder="adresse@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 text-sm sm:h-8 sm:max-w-xs"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={run} disabled={loading || !email}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
          Envoyer le test
        </Button>
      </div>
      <TestResultLine result={result} />
    </div>
  );
}
