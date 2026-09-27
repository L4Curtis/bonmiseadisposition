import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { loginSchema, validate } from '@/lib/validation';

/** Adresse où envoyer la personne une fois connectée. Un mot de passe à
 *  changer passe d'abord par la page de changement, qui renvoie ensuite à
 *  `returnTo` (cf. pages/ChangePassword.tsx). */
export function afterLoginHref(returnTo: string | null, mustChangePassword: boolean): string {
  if (!mustChangePassword) return returnTo ?? '/';
  return returnTo
    ? `/change-password?forced=true&returnTo=${encodeURIComponent(returnTo)}`
    : '/change-password?forced=true';
}

interface LocalLoginFormProps {
  /** Adresse (déjà validée) où revenir après la connexion. */
  returnTo: string | null;
}

/**
 * Connexion par adresse et mot de passe. Pensée pour le téléphone : champs de
 * 44 px en 16 px (pas de zoom iOS), clavier « email » avec « @ », remplissage
 * automatique proposé par le navigateur, touche « Suivant » puis « OK ».
 */
export function LocalLoginForm({ returnTo }: LocalLoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(loginSchema, { email, password });
    if (!result.success) {
      setError(Object.values(result.errors)[0]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // « no-refresh » : ici, un 401 veut dire « identifiants refusés », pas
      // « session expirée ».
      const data = await api.post<{ mustChangePassword?: boolean }>(
        '/auth/local-login',
        { email, password },
        { onUnauthorized: 'no-refresh' },
      );
      window.location.href = afterLoginHref(returnTo, !!data?.mustChangePassword);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? errorMessage(err, 'Identifiants incorrects') : 'Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/25 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Adresse email</Label>
        <Input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Mot de passe</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="h-11 text-base"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="btn-gradient w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {loading && <Spinner className="h-4 w-4 motion-reduce:animate-none" />}
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
