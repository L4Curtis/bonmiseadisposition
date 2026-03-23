import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { changePasswordSchema, validate } from '@/lib/validation';

const PASSWORD_RULES = [
  { regex: /.{12,}/, label: '12 caractères minimum' },
  { regex: /[A-Z]/, label: '1 majuscule' },
  { regex: /[a-z]/, label: '1 minuscule' },
  { regex: /[0-9]/, label: '1 chiffre' },
  { regex: /[@$!%*?&_#^+=\-.]/, label: '1 caractère spécial (@$!%*?&_#^+=-.)'  },
];

export function ChangePasswordPage() {
  const [searchParams] = useSearchParams();
  const forced = searchParams.get('forced') === 'true';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const rulesStatus = PASSWORD_RULES.map((r) => ({
    ...r,
    ok: r.regex.test(newPassword),
  }));
  const allRulesOk = rulesStatus.every((r) => r.ok);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(changePasswordSchema, { currentPassword, newPassword, confirmPassword });
    if (!result.success) {
      setError(Object.values(result.errors)[0]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => { window.location.href = '/'; }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Erreur lors du changement de mot de passe');
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md w-full text-center p-8" aria-live="polite">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-500 dark:text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Mot de passe modifié</h1>
          <p className="text-sm text-muted-foreground mt-2">Redirection en cours...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
              <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {forced ? 'Changement de mot de passe obligatoire' : 'Changer mon mot de passe'}
            </h1>
            {forced && (
              <p className="text-sm text-amber-600 mt-2">
                Vous devez choisir un nouveau mot de passe avant de continuer.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mot de passe actuel</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nouveau mot de passe</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-input px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNew ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Password rules */}
            {newPassword.length > 0 && (
              <div className="rounded-lg bg-muted/40 border p-3 space-y-1">
                {rulesStatus.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    }
                    <span className={r.ok ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1" role="alert">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !allRulesOk || !passwordsMatch}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
