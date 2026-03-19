import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

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
        window.location.href = '/';
      } else {
        const data = await res.json();
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
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Bons de Mise à Disposition</h1>
            <p className="mt-2 text-sm text-slate-500">Groupe Livio — Service IT</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-700">
                {ERROR_MESSAGES[error] || 'Une erreur est survenue.'}
              </p>
            </div>
          )}

          {/* SSO Button */}
          <a
            href="/api/auth/login"
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 21 21" className="h-5 w-5 fill-white">
              <rect x="1" y="1" width="9" height="9" />
              <rect x="11" y="1" width="9" height="9" />
              <rect x="1" y="11" width="9" height="9" />
              <rect x="11" y="11" width="9" height="9" />
            </svg>
            Se connecter avec Microsoft
          </a>

          {/* Local auth */}
          {localAuthEnabled && (
            <div className="mt-4">
              <button
                className="w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setShowLocal((v) => !v)}
              >
                {showLocal ? '▲ Masquer la connexion locale' : '▼ Connexion avec un compte local'}
              </button>

              {showLocal && (
                <form onSubmit={handleLocalLogin} className="mt-4 space-y-3">
                  {localError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                      <p className="text-sm text-red-700">{localError}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input
                      type="text"
                      value={localEmail}
                      onChange={(e) => setLocalEmail(e.target.value)}
                      placeholder="admin@local"
                      required
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe</label>
                    <input
                      type="password"
                      value={localPassword}
                      onChange={(e) => setLocalPassword(e.target.value)}
                      required
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={localLoading}
                    className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
                  >
                    {localLoading ? 'Connexion...' : 'Se connecter'}
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    Compte par défaut : admin@local / admin
                  </p>
                </form>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Authentification sécurisée via Microsoft Entra ID
          </p>
        </div>
      </div>
    </div>
  );
}
