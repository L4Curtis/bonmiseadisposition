import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ChevronDown, ChevronUp } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  entra_config_missing: "La configuration Microsoft Entra ID n'est pas encore configurée.",
  auth_failed: "L'authentification a échoué. Veuillez réessayer.",
  invalid_state: 'Erreur de sécurité lors de la connexion. Veuillez réessayer.',
  access_denied: 'Accès refusé par Microsoft.',
};

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
  const [showLocal, setShowLocal] = useState(false);
  const [localEmail, setLocalEmail] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const error = searchParams.get('error');

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/setup-required', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/auth/local-auth-status', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([setupData, localData]) => {
      setSetupRequired(setupData.setupRequired);
      setLocalAuthEnabled(localData.enabled);
    });
  }, []);

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);
    setLocalError('');
    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localEmail, password: localPassword }),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          window.location.href = '/change-password?forced=true';
        } else {
          window.location.href = '/';
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setLocalError(data.message || 'Identifiants incorrects');
      }
    } catch {
      setLocalError('Erreur de connexion au serveur');
    } finally {
      setLocalLoading(false);
    }
  };

  if (setupRequired === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <Spinner className="h-8 w-8 text-primary motion-reduce:animate-none" />
        <span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md px-4">
        <Card className="shadow-lg border-0">
          <CardContent className="p-8">
            {/* Brand */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white font-bold text-lg">
                GL
              </div>
              <h1 className="text-xl font-bold text-slate-900">Bons de Mise à Disposition</h1>
              <p className="mt-1 text-sm text-muted-foreground">Groupe Livio — Service IT</p>
            </div>

            {/* Error banner */}
            {error && (
              <div role="alert" className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <p className="text-sm text-destructive">
                  {ERROR_MESSAGES[error] || 'Une erreur est survenue.'}
                </p>
              </div>
            )}

            {/* SSO Button */}
            <Button asChild size="lg" className="w-full">
              <a href="/api/auth/login" className="flex items-center justify-center gap-3">
                <svg viewBox="0 0 21 21" className="h-5 w-5 fill-current">
                  <rect x="1" y="1" width="9" height="9" />
                  <rect x="11" y="1" width="9" height="9" />
                  <rect x="1" y="11" width="9" height="9" />
                  <rect x="11" y="11" width="9" height="9" />
                </svg>
                Se connecter avec Microsoft
              </a>
            </Button>

            {/* Local auth */}
            {localAuthEnabled && (
              <div className="mt-5">
                <button
                  className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-slate-600 transition-colors"
                  onClick={() => setShowLocal((v) => !v)}
                >
                  {showLocal ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Masquer la connexion locale
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Connexion avec un compte local
                    </>
                  )}
                </button>

                {showLocal && (
                  <form onSubmit={handleLocalLogin} className="mt-4 space-y-4">
                    {localError && (
                      <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                        <p className="text-sm text-destructive">{localError}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="text"
                        value={localEmail}
                        onChange={(e) => setLocalEmail(e.target.value)}
                        placeholder="admin@local"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Mot de passe</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={localPassword}
                        onChange={(e) => setLocalPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={localLoading}
                      className="w-full"
                    >
                      {localLoading ? 'Connexion...' : 'Se connecter'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Compte local IT uniquement
                    </p>
                  </form>
                )}
              </div>
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Authentification sécurisée via Microsoft Entra ID
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
