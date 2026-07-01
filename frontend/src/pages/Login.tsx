import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { loginSchema, validate } from '@/lib/validation';

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
    }).catch(() => {
      // Backend partiellement indisponible : afficher quand même la page de
      // connexion (bouton SSO) plutôt qu'un spinner infini
      setSetupRequired(false);
      setLocalAuthEnabled(true);
    });
  }, []);

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(loginSchema, { email: localEmail, password: localPassword });
    if (!result.success) {
      setLocalError(Object.values(result.errors)[0]);
      return;
    }
    setLocalLoading(true);
    setLocalError('');
    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
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
      <div className="flex h-screen items-center justify-center bg-[hsl(30_24%_6%)]" aria-live="polite">
        <Spinner className="h-8 w-8 text-primary motion-reduce:animate-none" />
        <span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  return (
    <div className="bg-aurora relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Grille de points masquée + blobs animés */}
      <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full" style={{ background: 'hsl(var(--primary))', filter: 'blur(80px)', opacity: 0.22, animation: 'blob-drift 12s ease-in-out infinite' }} />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full" style={{ background: 'hsl(14 80% 52%)', filter: 'blur(90px)', opacity: 0.16, animation: 'blob-drift 16s 4s ease-in-out infinite' }} />
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full" style={{ background: 'hsl(4 69% 51%)', filter: 'blur(100px)', opacity: 0.10, animation: 'blob-drift 20s 8s ease-in-out infinite' }} />

      <div className="relative w-full max-w-md px-4">
        <Card className="animate-fade-in rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-2xl shadow-card-colored">
          <CardContent className="p-8">
            {/* Brand */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl btn-gradient text-white font-bold text-xl shadow-card-colored ring-1 ring-white/25">
                GL
              </div>
              <h1 className="text-[22px] font-bold tracking-tight text-white">
                Bons de mise à disposition
              </h1>
              <p className="mt-1.5 text-sm text-white/50">Groupe Livio — Service informatique</p>
            </div>

            {/* Error banner */}
            {error && (
              <div role="alert" className="mb-6 rounded-xl bg-red-500/10 border border-red-500/25 p-4">
                <p className="text-sm text-red-300">
                  {ERROR_MESSAGES[error] || 'Une erreur est survenue.'}
                </p>
              </div>
            )}

            {/* SSO Button — blanc, logo Microsoft couleur (pattern 2026) */}
            <a
              href="/api/auth/login"
              className="group flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-[15px] font-semibold text-zinc-900 shadow-[0_1px_2px_rgb(0_0_0/0.3),inset_0_-1px_0_rgb(0_0_0/0.06)] transition-all duration-150 hover:bg-zinc-100 hover:shadow-card-colored active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <svg viewBox="0 0 21 21" className="h-[18px] w-[18px]">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Continuer avec Microsoft
              <span aria-hidden="true" className="text-zinc-400 transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </a>

            {/* Local auth */}
            {localAuthEnabled && (
              <div className="mt-5">
                <button
                  className="flex w-full items-center justify-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
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

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-white/35">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Authentification sécurisée via Microsoft Entra ID
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
