import { useEffect, useState } from 'react';
import { Pen } from 'lucide-react';
import { api } from '@/lib/api';
import { LocalLoginForm } from './LocalLoginForm';

/** Adresses d'un collaborateur arrivé par un lien reçu par email : la page de
 *  signature et son espace « Mes équipements ». */
const COLLABORATOR_PATHS = [/^\/signer\//, /^\/mes-bons(\/|\?|$)/, /^\/mes-equipements(\/|\?|$)/];

export function isCollaboratorReturnTo(returnTo: string | null): boolean {
  return !!returnTo && COLLABORATOR_PATHS.some((pattern) => pattern.test(returnTo));
}

/** La connexion locale est-elle ouverte ? Supposée oui tant que le serveur
 *  n'a pas répondu (les champs s'affichent tout de suite), et oui aussi s'il
 *  ne répond pas : la connexion dira alors elle-même ce qui ne va pas. */
function useLocalAuthEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ enabled: boolean }>('/auth/local-auth-status', { signal: controller.signal, onUnauthorized: 'no-refresh' })
      .then((status) => setEnabled(status.enabled))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return enabled;
}

function MicrosoftLogo() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

interface CollaboratorLoginCardProps {
  /** Adresse (déjà validée) où revenir après la connexion. */
  returnTo: string | null;
  title?: string;
  message?: string;
}

/**
 * Connexion du collaborateur venu d'un lien reçu par email, en un seul écran :
 * Microsoft, et juste dessous le formulaire du compte local, déjà ouvert.
 * Même carte claire sur la page de signature et sur la page de connexion.
 *
 * Téléphone en paysage (écran bas) : l'icône et le texte d'accueil laissent la
 * place, les deux moyens de connexion passent côte à côte ; le champ « Adresse
 * email » reste visible sans défiler.
 */
export function CollaboratorLoginCard({
  returnTo,
  title = 'Connexion requise',
  message = 'Connectez-vous pour consulter et signer vos documents.',
}: CollaboratorLoginCardProps) {
  const localEnabled = useLocalAuthEnabled();
  const ssoHref = returnTo ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}` : '/api/auth/login';
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-6 [@media(max-height:500px)]:py-3">
      <main className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-6 sm:p-8 [@media(max-height:500px)_and_(min-width:640px)]:max-w-3xl">
        <div className="grid gap-5 [@media(max-height:500px)]:gap-3 [@media(max-height:500px)_and_(min-width:640px)]:grid-cols-2 [@media(max-height:500px)_and_(min-width:640px)]:gap-6">
          <div className="space-y-4 text-center [@media(max-height:500px)]:space-y-3">
            <div className="bg-primary/10 rounded-full w-14 h-14 flex items-center justify-center mx-auto [@media(max-height:500px)]:hidden">
              <Pen className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
            </div>
            <a
              href={ssoHref}
              className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-[15px] font-semibold text-foreground shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MicrosoftLogo />
              Continuer avec Microsoft
            </a>
            <p className="text-xs text-muted-foreground/80 [@media(max-height:500px)]:hidden">Groupe Livio — Équipe informatique</p>
          </div>
          {localEnabled && (
            <div className="space-y-3">
              <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                ou avec votre adresse et votre mot de passe
              </p>
              <LocalLoginForm returnTo={returnTo} tone="light" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
