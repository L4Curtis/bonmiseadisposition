import { Pen, XCircle } from 'lucide-react';
import type { User } from '@/types';

interface LoginRequiredScreenProps {
  signerReturnToQuery: string;
  onSSOLogin: () => void;
}

export function LoginRequiredScreen({ signerReturnToQuery, onSSOLogin }: LoginRequiredScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-8 text-center space-y-4">
        <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <Pen className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Connexion requise</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Vous devez vous connecter avec votre compte Microsoft pour consulter et signer ce document.
          </p>
        </div>
        <button
          onClick={onSSOLogin}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Se connecter avec Microsoft
        </button>
        <a
          href={`/login${signerReturnToQuery}`}
          className="block text-sm text-primary hover:underline"
        >
          Connexion avec un compte local
        </a>
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
      </div>
    </div>
  );
}

interface UnauthorizedScreenProps {
  currentUser: User;
  onChangeAccount: () => void;
}

export function UnauthorizedScreen({ currentUser, onChangeAccount }: UnauthorizedScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-8 text-center space-y-4">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <XCircle className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Compte non autorisé</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ce document est destiné à un autre collaborateur. Vous êtes connecté en tant que{' '}
            <strong>{currentUser.email}</strong> — reconnectez-vous avec le compte Microsoft du destinataire.
          </p>
        </div>
        <button
          onClick={onChangeAccount}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Changer de compte
        </button>
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
      </div>
    </div>
  );
}
